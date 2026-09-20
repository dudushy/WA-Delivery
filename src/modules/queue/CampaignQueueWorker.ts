import { EventEmitter } from 'node:events';
import type { CampaignService } from '../campaigns/CampaignService.js';
import type { MediaService } from '../media/MediaService.js';
import type { SettingsService } from '../settings/SettingsService.js';
import type { WhatsAppProvider } from '../../providers/whatsapp/WhatsAppProvider.js';
import { withTimeout } from '../../shared/withTimeout.js';
import { logger, maskPhone, maskSensitive } from '../../shared/logger.js';
import { CampaignQueueRepository } from './CampaignQueueRepository.js';
import { classifyError } from './errorClassification.js';
import { QueueStateError, type QueueProgress } from './queueTypes.js';

const PROGRESS_EVENT = 'progress';

/** Tempo limite padrão para cada operação do WhatsAppProvider (30 segundos). */
export const DEFAULT_OPERATION_TIMEOUT_MS = 30_000;

/** Número máximo de tentativas por destinatário para falhas transitórias. */
export const DEFAULT_MAX_ATTEMPTS = 3;

/** Base do backoff exponencial entre tentativas transitórias (1 segundo). */
export const DEFAULT_RETRY_BACKOFF_MS = 1_000;

/** Teto do backoff entre tentativas (30 segundos). */
export const DEFAULT_RETRY_BACKOFF_CAP_MS = 30_000;

/**
 * Calcula o backoff exponencial para a próxima tentativa: base * 2^(attempt-1),
 * limitado pelo teto. `attempt` é o número da tentativa que acabou de falhar
 * (1 para a primeira). Retorna 0 quando a base é 0 (backoff desativado).
 */
export function computeBackoffMs(attempt: number, baseMs: number, capMs: number): number {
  if (baseMs <= 0) return 0;
  const exponential = baseMs * 2 ** Math.max(0, attempt - 1);
  return Math.min(exponential, Math.max(baseMs, capMs));
}

export class CampaignQueueWorker {
  private readonly events = new EventEmitter();
  private activeCampaignId: number | undefined;
  private delayTimer: NodeJS.Timeout | undefined;
  private releaseDelay: (() => void) | undefined;
  private readonly fallbackOperationTimeoutMs: number;
  private readonly fallbackMaxAttempts: number;
  private readonly fallbackRetryBackoffMs: number;
  private readonly fallbackRetryBackoffCapMs: number;
  private readonly settings: SettingsService | undefined;
  /** Campanhas pausadas automaticamente por queda de conexão (auto-retomáveis). */
  private readonly autoPausedCampaigns = new Set<number>();
  private readonly unsubscribeConnection: () => void;

  public constructor(
    private readonly repository: CampaignQueueRepository,
    private readonly campaigns: CampaignService,
    private readonly media: MediaService,
    private readonly whatsapp: WhatsAppProvider,
    private readonly random: () => number = Math.random,
    operationTimeoutMs: number = DEFAULT_OPERATION_TIMEOUT_MS,
    maxAttempts: number = DEFAULT_MAX_ATTEMPTS,
    retryBackoffMs: number = DEFAULT_RETRY_BACKOFF_MS,
    retryBackoffCapMs: number = DEFAULT_RETRY_BACKOFF_CAP_MS,
    settings?: SettingsService,
  ) {
    this.fallbackOperationTimeoutMs = operationTimeoutMs;
    this.fallbackMaxAttempts = Math.max(1, maxAttempts);
    this.fallbackRetryBackoffMs = Math.max(0, retryBackoffMs);
    this.fallbackRetryBackoffCapMs = Math.max(this.fallbackRetryBackoffMs, retryBackoffCapMs);
    this.settings = settings;
    // Retoma automaticamente campanhas que foram pausadas por queda de conexão
    // assim que o WhatsApp reconectar.
    this.unsubscribeConnection = this.whatsapp.onConnectionState((state) => {
      if (state.status === 'connected') this.resumeAutoPaused();
    });
  }

  /** Tempo limite atual das operações do provider (respeita as configurações). */
  private get operationTimeoutMs(): number {
    return this.settings?.getAll().operationTimeoutMs ?? this.fallbackOperationTimeoutMs;
  }

  /** Limite atual de tentativas por destinatário (respeita as configurações). */
  private get maxAttempts(): number {
    return Math.max(1, this.settings?.getAll().maxAttempts ?? this.fallbackMaxAttempts);
  }

  /** Backoff base atual entre tentativas transitórias (respeita as configurações). */
  private get retryBackoffMs(): number {
    return Math.max(0, this.settings?.getAll().retryBackoffMs ?? this.fallbackRetryBackoffMs);
  }

  /** Teto atual do backoff entre tentativas (respeita as configurações). */
  private get retryBackoffCapMs(): number {
    return Math.max(
      this.retryBackoffMs,
      this.settings?.getAll().retryBackoffCapMs ?? this.fallbackRetryBackoffCapMs,
    );
  }

  private resumeAutoPaused(): void {
    for (const campaignId of [...this.autoPausedCampaigns]) {
      try {
        this.resume(campaignId);
      } catch {
        // A campanha pode ter mudado de estado nesse meio-tempo; ignora e mantém
        // o registro apenas se ainda estiver pausada.
      }
      if (this.repository.progress(campaignId)?.status !== 'paused') {
        this.autoPausedCampaigns.delete(campaignId);
      }
    }
  }

  /** Pausa a campanha por queda de conexão, marcando-a para auto-retomada. */
  private pauseForDisconnect(campaignId: number): void {
    if (this.repository.setStatus(campaignId, 'running', 'paused')) {
      this.autoPausedCampaigns.add(campaignId);
      this.interruptDelay();
      this.emit(campaignId);
    }
  }

  /**
   * Calcula o backoff exponencial para a próxima tentativa de um destinatário.
   * `attempt` é o número da tentativa que acabou de falhar (1 para a primeira).
   */
  private computeBackoffMs(attempt: number): number {
    return computeBackoffMs(attempt, this.retryBackoffMs, this.retryBackoffCapMs);
  }

  public recoverInterrupted(): number {
    return this.repository.recoverInterrupted();
  }

  public start(campaignId: number, confirmed: boolean): QueueProgress {
    if (!confirmed) throw new QueueStateError('Confirme que deseja iniciar os envios reais.');
    if (this.whatsapp.getConnectionState().status !== 'connected') {
      throw new QueueStateError('Conecte o WhatsApp antes de iniciar a campanha.');
    }
    if (!this.repository.start(campaignId, 'ready')) {
      throw new QueueStateError(
        'A campanha não está preparada ou já existe outra campanha em execução.',
      );
    }
    this.run(campaignId);
    return this.requireProgress(campaignId);
  }

  public pause(campaignId: number): QueueProgress {
    if (!this.repository.setStatus(campaignId, 'running', 'paused')) {
      throw new QueueStateError('A campanha não está em execução.');
    }
    // Pausa manual: não deve ser retomada automaticamente ao reconectar.
    this.autoPausedCampaigns.delete(campaignId);
    this.interruptDelay();
    this.emit(campaignId);
    return this.requireProgress(campaignId);
  }

  public resume(campaignId: number): QueueProgress {
    if (this.whatsapp.getConnectionState().status !== 'connected') {
      throw new QueueStateError('Conecte o WhatsApp antes de retomar a campanha.');
    }
    if (!this.repository.start(campaignId, 'paused')) {
      throw new QueueStateError(
        'A campanha não está pausada ou já existe outra campanha em execução.',
      );
    }
    this.autoPausedCampaigns.delete(campaignId);
    this.run(campaignId);
    return this.requireProgress(campaignId);
  }

  public cancel(campaignId: number): QueueProgress {
    const progress = this.repository.progress(campaignId);
    if (!progress || !['ready', 'running', 'paused'].includes(progress.status)) {
      throw new QueueStateError('A campanha não pode ser cancelada neste estado.');
    }
    if (!this.repository.setStatus(campaignId, progress.status, 'cancelled')) {
      throw new QueueStateError('Não foi possível cancelar a campanha.');
    }
    this.autoPausedCampaigns.delete(campaignId);
    this.repository.skipPending(campaignId);
    this.interruptDelay();
    this.emit(campaignId);
    return this.requireProgress(campaignId);
  }

  public progress(campaignId: number): QueueProgress | undefined {
    return this.repository.progress(campaignId);
  }

  public onProgress(listener: (progress: QueueProgress) => void): () => void {
    this.events.on(PROGRESS_EVENT, listener);
    return () => this.events.off(PROGRESS_EVENT, listener);
  }

  public shutdown(): void {
    this.unsubscribeConnection();
    if (this.activeCampaignId !== undefined) {
      this.repository.setStatus(this.activeCampaignId, 'running', 'paused');
    }
    this.interruptDelay();
  }

  private run(campaignId: number): void {
    if (this.activeCampaignId !== undefined && this.activeCampaignId !== campaignId) return;
    this.activeCampaignId = campaignId;
    void this.process(campaignId).finally(() => {
      if (this.activeCampaignId === campaignId) this.activeCampaignId = undefined;
    });
  }

  private async process(campaignId: number): Promise<void> {
    while (this.repository.progress(campaignId)?.status === 'running') {
      // Detecção proativa: se a conexão caiu, pausa antes de consumir tentativas.
      if (this.whatsapp.getConnectionState().status !== 'connected') {
        this.pauseForDisconnect(campaignId);
        return;
      }
      const recipient = this.repository.findNext(campaignId);
      if (!recipient) {
        this.repository.setStatus(campaignId, 'running', 'completed');
        this.emit(campaignId);
        return;
      }

      const attemptId = this.repository.markSending(recipient);
      this.emit(campaignId);
      let backoffMs = 0;
      try {
        const registered = await withTimeout(
          () => this.whatsapp.isRegisteredNumber(recipient.phone),
          this.operationTimeoutMs,
          'A verificação do número excedeu o tempo limite.',
        );
        if (!registered) {
          this.repository.finishAttempt(attemptId, recipient.id, 'skipped', {
            error: 'O número não está registrado no WhatsApp.',
          });
          logger.info(
            { campaignId, phone: maskPhone(recipient.phone), outcome: 'skipped' },
            'Destinatário ignorado: número não registrado.',
          );
        } else {
          const campaign = this.campaigns.findById(campaignId);
          if (!campaign) throw new Error('Campanha não encontrada durante o envio.');
          const result = campaign.media
            ? await this.sendMedia(campaign.media.id, recipient.phone, recipient.renderedMessage)
            : await withTimeout(
                () => this.whatsapp.sendText(recipient.phone, recipient.renderedMessage),
                this.operationTimeoutMs,
                'O envio da mensagem excedeu o tempo limite.',
              );
          this.repository.finishAttempt(attemptId, recipient.id, 'sent', {
            messageId: result.messageId,
          });
          logger.info(
            { campaignId, phone: maskPhone(recipient.phone), outcome: 'sent' },
            'Mensagem enviada.',
          );
        }
      } catch (error) {
        const kind = classifyError(error);
        const message = error instanceof Error ? error.message : String(error);
        // A tentativa atual é a de número (attemptCount anterior + 1).
        const currentAttempt = recipient.attemptCount + 1;
        const disconnected = this.whatsapp.getConnectionState().status !== 'connected';
        if (kind === 'transient' && !disconnected && currentAttempt < this.maxAttempts) {
          // Falha transitória com tentativas restantes: recoloca como pendente
          // e agenda um backoff exponencial antes da próxima tentativa.
          this.repository.retryLater(
            attemptId,
            recipient.id,
            `[transient] tentativa ${currentAttempt}/${this.maxAttempts}: ${message}`,
          );
          backoffMs = this.computeBackoffMs(currentAttempt);
          logger.warn(
            { campaignId, phone: maskPhone(recipient.phone), attempt: currentAttempt, kind },
            `Falha transitória; reprocessando: ${maskSensitive(message)}`,
          );
        } else {
          // Erro permanente, sem conexão, ou limite de tentativas atingido.
          this.repository.finishAttempt(attemptId, recipient.id, 'failed', {
            error: `[${kind}] ${message}`,
            kind,
          });
          logger.warn(
            { campaignId, phone: maskPhone(recipient.phone), kind },
            `Envio falhou: ${maskSensitive(message)}`,
          );
        }
        if (disconnected) {
          this.pauseForDisconnect(campaignId);
          return;
        }
      }
      this.emit(campaignId);

      const campaign = this.campaigns.findById(campaignId);
      if (!campaign || this.repository.progress(campaignId)?.status !== 'running') return;
      if (backoffMs > 0) {
        // Backoff antes de reprocessar o destinatário que falhou de forma transitória.
        await this.wait(backoffMs);
      } else if (this.repository.findNext(campaignId)) {
        const range = campaign.delayMaxSeconds - campaign.delayMinSeconds;
        const delaySeconds = campaign.delayMinSeconds + Math.floor(this.random() * (range + 1));
        await this.wait(delaySeconds * 1_000);
      }
    }
  }

  private async sendMedia(mediaId: number, phone: string, caption: string) {
    const stored = this.media.findById(mediaId);
    if (!stored) throw new Error('A mídia da campanha não foi encontrada.');
    return withTimeout(
      () =>
        this.whatsapp.sendMedia(phone, {
          path: this.media.resolvePath(stored),
          kind: stored.kind,
          caption,
          mimetype: stored.mimetype,
        }),
      this.operationTimeoutMs,
      'O envio da mídia excedeu o tempo limite.',
    );
  }

  private wait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
      this.releaseDelay = resolve;
      this.delayTimer = setTimeout(() => {
        this.delayTimer = undefined;
        this.releaseDelay = undefined;
        resolve();
      }, milliseconds);
    });
  }

  private interruptDelay(): void {
    if (this.delayTimer) clearTimeout(this.delayTimer);
    this.delayTimer = undefined;
    const release = this.releaseDelay;
    this.releaseDelay = undefined;
    release?.();
  }

  private emit(campaignId: number): void {
    const progress = this.repository.progress(campaignId);
    if (progress) this.events.emit(PROGRESS_EVENT, progress);
  }

  private requireProgress(campaignId: number): QueueProgress {
    const progress = this.repository.progress(campaignId);
    if (!progress) throw new QueueStateError('Campanha não encontrada.');
    return progress;
  }
}
