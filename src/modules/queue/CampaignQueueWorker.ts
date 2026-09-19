import { EventEmitter } from 'node:events';
import type { CampaignService } from '../campaigns/CampaignService.js';
import type { MediaService } from '../media/MediaService.js';
import type { WhatsAppProvider } from '../../providers/whatsapp/WhatsAppProvider.js';
import { CampaignQueueRepository } from './CampaignQueueRepository.js';
import { QueueStateError, type QueueProgress } from './queueTypes.js';

const PROGRESS_EVENT = 'progress';

export class CampaignQueueWorker {
  private readonly events = new EventEmitter();
  private activeCampaignId: number | undefined;
  private delayTimer: NodeJS.Timeout | undefined;
  private releaseDelay: (() => void) | undefined;

  public constructor(
    private readonly repository: CampaignQueueRepository,
    private readonly campaigns: CampaignService,
    private readonly media: MediaService,
    private readonly whatsapp: WhatsAppProvider,
    private readonly random: () => number = Math.random,
  ) {}

  public recoverInterrupted(): number {
    return this.repository.recoverInterrupted();
  }

  public start(campaignId: number, confirmed: boolean): QueueProgress {
    if (!confirmed) throw new QueueStateError('Confirme que deseja iniciar os envios reais.');
    if (this.whatsapp.getConnectionState().status !== 'connected') {
      throw new QueueStateError('Conecte o WhatsApp antes de iniciar a campanha.');
    }
    if (!this.repository.start(campaignId, 'ready')) {
      throw new QueueStateError('A campanha não está preparada ou já existe outra campanha em execução.');
    }
    this.run(campaignId);
    return this.requireProgress(campaignId);
  }

  public pause(campaignId: number): QueueProgress {
    if (!this.repository.setStatus(campaignId, 'running', 'paused')) {
      throw new QueueStateError('A campanha não está em execução.');
    }
    this.interruptDelay();
    this.emit(campaignId);
    return this.requireProgress(campaignId);
  }

  public resume(campaignId: number): QueueProgress {
    if (this.whatsapp.getConnectionState().status !== 'connected') {
      throw new QueueStateError('Conecte o WhatsApp antes de retomar a campanha.');
    }
    if (!this.repository.start(campaignId, 'paused')) {
      throw new QueueStateError('A campanha não está pausada ou já existe outra campanha em execução.');
    }
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
      const recipient = this.repository.findNext(campaignId);
      if (!recipient) {
        this.repository.setStatus(campaignId, 'running', 'completed');
        this.emit(campaignId);
        return;
      }

      const attemptId = this.repository.markSending(recipient);
      this.emit(campaignId);
      try {
        const registered = await this.whatsapp.isRegisteredNumber(recipient.phone);
        if (!registered) {
          this.repository.finishAttempt(attemptId, recipient.id, 'skipped', {
            error: 'O número não está registrado no WhatsApp.',
          });
        } else {
          const campaign = this.campaigns.findById(campaignId);
          if (!campaign) throw new Error('Campanha não encontrada durante o envio.');
          const result = campaign.media
            ? await this.sendMedia(campaign.media.id, recipient.phone, recipient.renderedMessage)
            : await this.whatsapp.sendText(recipient.phone, recipient.renderedMessage);
          this.repository.finishAttempt(attemptId, recipient.id, 'sent', { messageId: result.messageId });
        }
      } catch (error) {
        this.repository.finishAttempt(attemptId, recipient.id, 'failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        if (this.whatsapp.getConnectionState().status !== 'connected') {
          this.repository.setStatus(campaignId, 'running', 'paused');
          this.emit(campaignId);
          return;
        }
      }
      this.emit(campaignId);

      const campaign = this.campaigns.findById(campaignId);
      if (!campaign || this.repository.progress(campaignId)?.status !== 'running') return;
      if (this.repository.findNext(campaignId)) {
        const range = campaign.delayMaxSeconds - campaign.delayMinSeconds;
        const delaySeconds = campaign.delayMinSeconds + Math.floor(this.random() * (range + 1));
        await this.wait(delaySeconds * 1_000);
      }
    }
  }

  private async sendMedia(mediaId: number, phone: string, caption: string) {
    const stored = this.media.findById(mediaId);
    if (!stored) throw new Error('A mídia da campanha não foi encontrada.');
    return this.whatsapp.sendMedia(phone, {
      path: this.media.resolvePath(stored),
      kind: stored.kind,
      caption,
      mimetype: stored.mimetype,
    });
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
