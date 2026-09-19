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

  server.get<{ Params: { id: string } }>('/api/campaigns/:id', async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return reply.code(400).send({ message: 'Identificador da campanha inválido.' });
    }
    const campaign = campaigns.findById(id);
    return campaign ?? reply.code(404).send({ message: 'Campanha não encontrada.' });
  });

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

  server.put<{ Params: { id: string }; Body: CampaignComposerInput }>('/api/campaigns/:id', async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return reply.code(400).send({ message: 'Identificador da campanha inválido.' });
    }
    try {
      const campaign = await campaigns.updateDraft(id, request.body ?? ({} as CampaignComposerInput));
      return campaign ?? reply.code(404).send({ message: 'Rascunho não encontrado.' });
    } catch (error) {
      return sendCampaignError(reply, error);
    }
  });

  server.delete<{ Params: { id: string } }>('/api/campaigns/:id', async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return reply.code(400).send({ message: 'Identificador da campanha inválido.' });
    }
    if (!await campaigns.deleteDraft(id)) {
      return reply.code(404).send({ message: 'Rascunho não encontrado.' });
    }
    return reply.code(204).send();
  });
}

function sendCampaignError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof CampaignValidationError) {
    return reply.code(422).send({ message: error.message, issues: error.issues });
  }
  throw error;
}
