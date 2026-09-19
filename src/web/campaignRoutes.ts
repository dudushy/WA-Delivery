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

  server.post<{ Params: { id: string }; Body: { confirmed?: boolean } }>('/api/campaigns/:id/prepare', async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return reply.code(400).send({ message: 'Identificador da campanha inválido.' });
    }
    try {
      const campaign = campaigns.prepareDraft(id, request.body?.confirmed === true);
      if (!campaign) return reply.code(409).send({ message: 'A campanha não está disponível como rascunho.' });
      return { campaign, recipients: campaigns.listRecipients(id) };
    } catch (error) {
      return sendCampaignError(reply, error);
    }
  });

  server.get<{ Params: { id: string } }>('/api/campaigns/:id/recipients', async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return reply.code(400).send({ message: 'Identificador da campanha inválido.' });
    }
    const recipients = campaigns.listRecipients(id);
    return recipients === undefined
      ? reply.code(404).send({ message: 'Campanha não encontrada.' })
      : { items: recipients };
  });

  server.delete<{ Params: { id: string } }>('/api/campaigns/:id', async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return reply.code(400).send({ message: 'Identificador da campanha inválido.' });
    }
    if (!await campaigns.deleteCampaign(id)) {
      return reply.code(409).send({ message: 'A campanha não pode ser excluída enquanto está em execução.' });
    }
    return reply.code(204).send();
  });

  server.post<{ Params: { id: string } }>('/api/campaigns/:id/follow-up', async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return reply.code(400).send({ message: 'Identificador da campanha inválido.' });
    }
    try {
      return reply.code(201).send(campaigns.createFollowUp(id));
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
