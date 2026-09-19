import type { FastifyInstance, FastifyReply } from 'fastify';
import type { CampaignService } from '../modules/campaigns/CampaignService.js';
import {
  CampaignValidationError,
  type CampaignComposerInput,
} from '../modules/campaigns/campaignTypes.js';

export function registerCampaignRoutes(
  server: FastifyInstance,
  campaigns: CampaignService,
): void {
  server.get('/api/campaigns', async () => ({ items: campaigns.list() }));

  server.post<{ Body: CampaignComposerInput }>('/api/campaigns/simulate', async (request, reply) => {
    try {
      return campaigns.simulate(request.body ?? ({} as CampaignComposerInput));
    } catch (error) {
      return sendCampaignError(reply, error);
    }
  });

  server.post<{ Body: CampaignComposerInput }>('/api/campaigns', async (request, reply) => {
    try {
      return reply.code(201).send(
        campaigns.createDraft(request.body ?? ({} as CampaignComposerInput)),
      );
    } catch (error) {
      return sendCampaignError(reply, error);
    }
  });
}

function sendCampaignError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof CampaignValidationError) {
    return reply.code(422).send({ message: error.message, issues: error.issues });
  }
  throw error;
}
