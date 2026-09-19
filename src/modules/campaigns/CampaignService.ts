import type { ContactService } from '../contacts/ContactService.js';
import type { MediaService } from '../media/MediaService.js';
import { CampaignRepository } from './CampaignRepository.js';
import {
  CampaignValidationError,
  type CampaignComposerInput,
  type CampaignRecipientSnapshot,
  type CampaignSimulation,
  type CampaignSummary,
} from './campaignTypes.js';

const MAX_MESSAGE_LENGTH = 4_096;
const MAX_DELAY_SECONDS = 3_600;

export class CampaignService {
  public constructor(
    private readonly repository: CampaignRepository,
    private readonly contacts: ContactService,
    private readonly media: MediaService,
  ) {}

  public simulate(input: CampaignComposerInput): CampaignSimulation {
    const validated = this.validate(input, false);
    const list = this.contacts.findById(validated.contactListId);
    if (!list) {
      throw new CampaignValidationError([
        { path: 'contactListId', message: 'A lista de contatos não existe.' },
      ]);
    }
    if (list.contacts.length === 0) {
      throw new CampaignValidationError([
        { path: 'contactListId', message: 'A lista selecionada está vazia.' },
      ]);
    }

    // Contatos com opt-out são bloqueados: não entram na simulação nem no snapshot.
    const eligible = list.contacts.filter((contact) => !contact.optedOut);
    const optedOutCount = list.contacts.length - eligible.length;
    if (eligible.length === 0) {
      throw new CampaignValidationError([
        { path: 'contactListId', message: 'Todos os contatos da lista estão marcados como opt-out.' },
      ]);
    }

    // Variáveis disponíveis: `nome` + colunas extras presentes na lista.
    const availableVariables = new Set<string>(['nome']);
    for (const contact of list.contacts) {
      for (const key of Object.keys(contact.data ?? {})) availableVariables.add(key);
    }
    const unknownVariables = [...validated.messageTemplate.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)]
      .map((match) => match[1]?.trim().toLowerCase())
      .filter((variable): variable is string => Boolean(variable))
      .filter((variable) => !availableVariables.has(variable));
    if (unknownVariables.length > 0) {
      throw new CampaignValidationError([
        {
          path: 'messageTemplate',
          message: `Variáveis não reconhecidas para esta lista: ${[...new Set(unknownVariables)].join(', ')}.`,
        },
      ]);
    }

    const intervals = Math.max(0, eligible.length - 1);
    return {
      contactListId: list.id,
      contactListName: list.name,
      recipientCount: eligible.length,
      optedOutCount,
      delayMinSeconds: validated.delayMinSeconds,
      delayMaxSeconds: validated.delayMaxSeconds,
      durationMinSeconds: intervals * validated.delayMinSeconds,
      durationAverageSeconds: Math.round(
        intervals * ((validated.delayMinSeconds + validated.delayMaxSeconds) / 2),
      ),
      durationMaxSeconds: intervals * validated.delayMaxSeconds,
      samples: eligible.slice(0, 3).map((contact) => ({
        contactId: contact.id,
        name: contact.name,
        phone: contact.phone,
        message: renderMessage(validated.messageTemplate, contact.name, contact.data),
      })),
    };
  }

  public createDraft(input: CampaignComposerInput): CampaignSummary {
    const validated = this.validate(input, true);
    this.simulate(validated);
    return this.repository.createDraft(validated as CampaignComposerInput & { name: string });
  }

  public list(): CampaignSummary[] {
    return this.repository.list();
  }

  public findById(id: number): CampaignSummary | undefined {
    return this.repository.findById(id);
  }

  public async updateDraft(id: number, input: CampaignComposerInput): Promise<CampaignSummary | undefined> {
    const existing = this.repository.findById(id);
    if (!existing || existing.status !== 'draft') return undefined;
    const validated = this.validate(input, true, existing.media?.id);
    const { mediaId: _mediaId, ...simulationInput } = validated;
    this.simulate(simulationInput);
    const updated = this.repository.updateDraft(
      id,
      validated as CampaignComposerInput & { name: string },
    );
    if (!updated) return undefined;
    if (updated.removedMediaStorageName) {
      await this.media.removeFile(updated.removedMediaStorageName);
    }
    return updated.campaign;
  }

  public async deleteCampaign(id: number): Promise<boolean> {
    const deleted = this.repository.deleteCampaign(id);
    if (!deleted) return false;
    if (deleted.mediaStorageName) await this.media.removeFile(deleted.mediaStorageName);
    return true;
  }

  /**
   * Limpeza explícita por retenção: remove campanhas finalizadas há mais de
   * `retentionDays` dias, junto com destinatários, tentativas e mídias. Retorna
   * quantas foram removidas. `retentionDays <= 0` desativa a limpeza (no-op).
   */
  public async cleanupOldCampaigns(retentionDays: number): Promise<number> {
    if (!Number.isFinite(retentionDays) || retentionDays <= 0) return 0;
    const { deletedCount, mediaStorageNames } = this.repository.deleteFinishedBefore(retentionDays);
    for (const storageName of mediaStorageNames) {
      await this.media.removeFile(storageName);
    }
    return deletedCount;
  }

  /**
   * Cria uma nova campanha (rascunho) a partir de uma campanha terminal,
   * contendo apenas os destinatários pendentes (que não foram enviados com
   * sucesso). A campanha de origem é preservada como histórico e a nova fica
   * vinculada a ela.
   */
  public createFollowUp(id: number): CampaignSummary {
    const source = this.repository.findById(id);
    if (!source) {
      throw new CampaignValidationError([
        { path: 'id', message: 'Campanha não encontrada.' },
      ]);
    }
    const terminal = source.status === 'completed'
      || source.status === 'cancelled'
      || source.status === 'failed';
    if (!terminal) {
      throw new CampaignValidationError([
        { path: 'status', message: 'Só é possível reenviar a partir de uma campanha finalizada, cancelada ou com falha.' },
      ]);
    }
    // Pendentes = destinatários que não foram enviados com sucesso.
    const optedOut = this.contacts.optedOutPhones();
    const pending = this.repository.listRecipients(id).filter(
      (recipient) => recipient.status !== 'sent' && !optedOut.has(recipient.phone),
    );
    if (pending.length === 0) {
      throw new CampaignValidationError([
        { path: 'recipients', message: 'Não há destinatários pendentes elegíveis para reenviar nesta campanha.' },
      ]);
    }
    return this.repository.createFollowUp(
      source,
      pending.map((recipient) => ({
        sourceContactId: recipient.sourceContactId,
        name: recipient.name,
        phone: recipient.phone,
        renderedMessage: recipient.renderedMessage,
      })),
    );
  }

  public prepareDraft(id: number, confirmed: boolean): CampaignSummary | undefined {
    if (confirmed !== true) {
      throw new CampaignValidationError([
        { path: 'confirmed', message: 'Confirme que revisou os destinatários e o conteúdo.' },
      ]);
    }
    const campaign = this.repository.findById(id);
    if (!campaign || campaign.status !== 'draft') return undefined;
    const list = this.contacts.findById(campaign.contactListId);
    if (!list || list.contacts.length === 0) {
      throw new CampaignValidationError([
        { path: 'contactListId', message: 'A lista selecionada não existe ou está vazia.' },
      ]);
    }
    // Bloqueia contatos com opt-out: não são incluídos no snapshot imutável.
    const eligible = list.contacts.filter((contact) => !contact.optedOut);
    if (eligible.length === 0) {
      throw new CampaignValidationError([
        { path: 'contactListId', message: 'Todos os contatos da lista estão marcados como opt-out.' },
      ]);
    }
    return this.repository.prepareDraft(
      id,
      eligible.map((contact) => ({
        sourceContactId: contact.id,
        name: contact.name,
        phone: contact.phone,
        renderedMessage: renderMessage(campaign.messageTemplate, contact.name, contact.data),
      })),
    );
  }

  public listRecipients(id: number): CampaignRecipientSnapshot[] | undefined {
    if (!this.repository.findById(id)) return undefined;
    return this.repository.listRecipients(id);
  }

  /**
   * Gera um relatório CSV dos destinatários da campanha. Quando `onlyFailures`
   * é verdadeiro, inclui apenas os destinatários com falha ou ignorados
   * (lista acionável de reenvio). Retorna undefined se a campanha não existir.
   */
  public exportRecipientsCsv(id: number, onlyFailures = false): string | undefined {
    const recipients = this.listRecipients(id);
    if (recipients === undefined) return undefined;
    const rows = onlyFailures
      ? recipients.filter((r) => r.status === 'failed' || r.status === 'skipped')
      : recipients;
    const header = ['nome', 'telefone', 'status', 'tentativas', 'enviado_em', 'ultimo_erro'];
    const lines = [header.map(csvCell).join(',')];
    for (const r of rows) {
      lines.push([
        r.name,
        r.phone,
        r.status,
        String(r.attemptCount),
        r.sentAt ?? '',
        r.lastError ?? '',
      ].map(csvCell).join(','));
    }
    return `${lines.join('\r\n')}\r\n`;
  }

  private validate(
    input: CampaignComposerInput,
    requireName: boolean,
    currentMediaId?: number,
  ): CampaignComposerInput {
    const issues: Array<{ path: string; message: string }> = [];
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const messageTemplate = typeof input.messageTemplate === 'string'
      ? input.messageTemplate.trim()
      : '';
    const contactListId = Number(input.contactListId);
    const delayMinSeconds = Number(input.delayMinSeconds);
    const delayMaxSeconds = Number(input.delayMaxSeconds);
    const mediaId = input.mediaId === undefined || input.mediaId === null
      ? input.mediaId
      : Number(input.mediaId);

    if (requireName && !name) issues.push({ path: 'name', message: 'Informe o nome da campanha.' });
    if (!Number.isSafeInteger(contactListId) || contactListId <= 0) {
      issues.push({ path: 'contactListId', message: 'Selecione uma lista de contatos.' });
    }
    if (!messageTemplate) issues.push({ path: 'messageTemplate', message: 'Escreva a mensagem.' });
    if (messageTemplate.length > MAX_MESSAGE_LENGTH) {
      issues.push({ path: 'messageTemplate', message: `A mensagem excede ${MAX_MESSAGE_LENGTH} caracteres.` });
    }

    if (!Number.isInteger(delayMinSeconds) || delayMinSeconds < 1 || delayMinSeconds > MAX_DELAY_SECONDS) {
      issues.push({ path: 'delayMinSeconds', message: 'O intervalo mínimo deve estar entre 1 e 3600 segundos.' });
    }
    if (!Number.isInteger(delayMaxSeconds) || delayMaxSeconds < 1 || delayMaxSeconds > MAX_DELAY_SECONDS) {
      issues.push({ path: 'delayMaxSeconds', message: 'O intervalo máximo deve estar entre 1 e 3600 segundos.' });
    }
    if (Number.isInteger(delayMinSeconds) && Number.isInteger(delayMaxSeconds) && delayMaxSeconds < delayMinSeconds) {
      issues.push({ path: 'delayMaxSeconds', message: 'O intervalo máximo não pode ser menor que o mínimo.' });
    }
    if (mediaId !== undefined && mediaId !== null) {
      const storedMedia = Number.isSafeInteger(mediaId) && mediaId > 0
        ? this.media.findById(mediaId)
        : undefined;
      if (!storedMedia || (storedMedia.status === 'attached' && storedMedia.id !== currentMediaId)) {
        issues.push({ path: 'mediaId', message: 'A mídia selecionada não existe ou expirou.' });
      }
    }

    if (issues.length > 0) throw new CampaignValidationError(issues);
    return {
      ...(requireName ? { name } : input.name === undefined ? {} : { name }),
      contactListId,
      messageTemplate,
      delayMinSeconds,
      delayMaxSeconds,
      ...(mediaId === undefined ? {} : { mediaId }),
    };
  }
}

export function renderMessage(
  template: string,
  name: string,
  data: Record<string, string> = {},
): string {
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, rawKey: string) => {
    const key = rawKey.trim().toLowerCase();
    if (key === 'nome') return name;
    // Variáveis de coluna extra: substitui pelo valor; ausência vira string vazia.
    return data[key] ?? '';
  });
}

/**
 * Escapa um valor para uma célula CSV: envolve em aspas quando contém aspas,
 * vírgula ou quebra de linha, dobrando as aspas internas (RFC 4180).
 */
function csvCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
