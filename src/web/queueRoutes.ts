import type { FastifyInstance, FastifyReply } from 'fastify';
import type { CampaignQueueWorker } from '../modules/queue/CampaignQueueWorker.js';
import { QueueStateError } from '../modules/queue/queueTypes.js';

export function registerQueueRoutes(server: FastifyInstance, queue: CampaignQueueWorker): void {
  server.get<{ Params: { id: string } }>('/api/campaigns/:id/progress', async (request, reply) => {
    const id = parseId(request.params.id, reply);
    if (id === undefined) return;
    return queue.progress(id) ?? reply.code(404).send({ message: 'Campanha não encontrada.' });
  });

  server.post<{ Params: { id: string }; Body: { confirmed?: boolean } }>('/api/campaigns/:id/start', async (request, reply) => {
    const id = parseId(request.params.id, reply);
    if (id === undefined) return;
    try {
      return queue.start(id, request.body?.confirmed === true);
    } catch (error) { return queueError(reply, error); }
  });

  for (const action of ['pause', 'resume', 'cancel'] as const) {
    server.post<{ Params: { id: string } }>(`/api/campaigns/:id/${action}`, async (request, reply) => {
      const id = parseId(request.params.id, reply);
      if (id === undefined) return;
      try { return queue[action](id); }
      catch (error) { return queueError(reply, error); }
    });
  }
}

function parseId(raw: string, reply: FastifyReply): number | undefined {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) {
    reply.code(400).send({ message: 'Identificador da campanha inválido.' });
    return undefined;
  }
  return id;
}

function queueError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof QueueStateError) return reply.code(409).send({ message: error.message });
  throw error;
}
