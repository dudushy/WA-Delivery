export interface CampaignComposerInput {
  name?: string;
  contactListId: number;
  messageTemplate: string;
  delayMinSeconds: number;
  delayMaxSeconds: number;
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
}

export class CampaignValidationError extends Error {
  public constructor(public readonly issues: Array<{ path: string; message: string }>) {
    super('Os dados da campanha são inválidos.');
    this.name = 'CampaignValidationError';
  }
}
