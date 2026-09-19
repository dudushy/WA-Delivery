export interface CampaignComposerInput {
  name?: string;
  contactListId: number;
  messageTemplate: string;
  delayMinSeconds: number;
  delayMaxSeconds: number;
  mediaId?: number | null;
}

export interface CampaignSimulation {
  contactListId: number;
  contactListName: string;
  recipientCount: number;
  delayMinSeconds: number;
  delayMaxSeconds: number;
  durationMinSeconds: number;
  durationAverageSeconds: number;
  durationMaxSeconds: number;
  samples: Array<{
    contactId: number;
    name: string;
    phone: string;
    message: string;
  }>;
}

export interface CampaignSummary {
  id: number;
  name: string;
  contactListId: number;
  contactListName: string;
  recipientCount: number;
  messageTemplate: string;
  delayMinSeconds: number;
  delayMaxSeconds: number;
  status: 'draft' | 'ready' | 'running' | 'paused' | 'completed' | 'cancelled' | 'failed';
  createdAt: string;
  updatedAt: string;
  preparedAt?: string;
  sourceCampaignId?: number;
  media?: {
    id: number;
    originalName: string;
    mimetype: string;
    kind: 'image' | 'video';
    sizeBytes: number;
  };
}

export interface CampaignRecipientSnapshot {
  id: number;
  campaignId: number;
  sourceContactId: number;
  name: string;
  phone: string;
  renderedMessage: string;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';
}

export class CampaignValidationError extends Error {
  public constructor(public readonly issues: Array<{ path: string; message: string }>) {
    super('Os dados da campanha são inválidos.');
    this.name = 'CampaignValidationError';
  }
}
