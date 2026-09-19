import type { ContactService } from '../contacts/ContactService.js';
import { CampaignRepository } from './CampaignRepository.js';
import {
  CampaignValidationError,
  type CampaignComposerInput,
  type CampaignSimulation,
  type CampaignSummary,
} from './campaignTypes.js';

const MAX_MESSAGE_LENGTH = 4_096;
const MAX_DELAY_SECONDS = 3_600;

export class CampaignService {
  public constructor(
    private readonly repository: CampaignRepository,
    private readonly contacts: ContactService,
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

    const intervals = Math.max(0, list.contacts.length - 1);
    return {
      contactListId: list.id,
      contactListName: list.name,
      recipientCount: list.contacts.length,
      delayMinSeconds: validated.delayMinSeconds,
      delayMaxSeconds: validated.delayMaxSeconds,
      durationMinSeconds: intervals * validated.delayMinSeconds,
      durationAverageSeconds: Math.round(
        intervals * ((validated.delayMinSeconds + validated.delayMaxSeconds) / 2),
      ),
      durationMaxSeconds: intervals * validated.delayMaxSeconds,
      samples: list.contacts.slice(0, 3).map((contact) => ({
        contactId: contact.id,
        name: contact.name,
        phone: contact.phone,
        message: renderMessage(validated.messageTemplate, contact.name),
      })),
    };
  }

  public createDraft(input: CampaignComposerInput): CampaignSummary {
    const validated = this.validate(input, true);
    this.simulate(validated);
    return this.repository.createDraft(validated as Required<CampaignComposerInput>);
  }

  public list(): CampaignSummary[] {
    return this.repository.list();
  }

  private validate(
    input: CampaignComposerInput,
    requireName: boolean,
  ): CampaignComposerInput {
    const issues: Array<{ path: string; message: string }> = [];
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const messageTemplate = typeof input.messageTemplate === 'string'
      ? input.messageTemplate.trim()
      : '';
    const contactListId = Number(input.contactListId);
    const delayMinSeconds = Number(input.delayMinSeconds);
    const delayMaxSeconds = Number(input.delayMaxSeconds);

    if (requireName && !name) issues.push({ path: 'name', message: 'Informe o nome da campanha.' });
    if (!Number.isSafeInteger(contactListId) || contactListId <= 0) {
      issues.push({ path: 'contactListId', message: 'Selecione uma lista de contatos.' });
    }
    if (!messageTemplate) issues.push({ path: 'messageTemplate', message: 'Escreva a mensagem.' });
    if (messageTemplate.length > MAX_MESSAGE_LENGTH) {
      issues.push({ path: 'messageTemplate', message: `A mensagem excede ${MAX_MESSAGE_LENGTH} caracteres.` });
    }

    const unknownVariables = [...messageTemplate.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)]
      .map((match) => match[1]?.trim().toLowerCase())
      .filter((variable) => variable && variable !== 'nome');
    if (unknownVariables.length > 0) {
      issues.push({
        path: 'messageTemplate',
        message: `Variáveis não reconhecidas: ${[...new Set(unknownVariables)].join(', ')}.`,
      });
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

    if (issues.length > 0) throw new CampaignValidationError(issues);
    return {
      ...(requireName ? { name } : input.name === undefined ? {} : { name }),
      contactListId,
      messageTemplate,
      delayMinSeconds,
      delayMaxSeconds,
    };
  }
}

export function renderMessage(template: string, name: string): string {
  return template.replace(/\{\{\s*nome\s*\}\}/gi, name);
}
