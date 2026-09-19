export type QueueAction = 'start' | 'pause' | 'resume' | 'cancel';

export interface QueueProgress {
  campaignId: number;
  status: 'ready' | 'running' | 'paused' | 'completed' | 'cancelled' | 'failed';
  total: number;
  pending: number;
  sent: number;
  failed: number;
  skipped: number;
}

export class QueueStateError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'QueueStateError';
  }
}
