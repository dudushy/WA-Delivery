import { resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import type { WhatsAppProvider } from '../providers/whatsapp/WhatsAppProvider.js';
import { toConnectionStateDto } from './connectionDto.js';

export async function buildServer(provider: WhatsAppProvider): Promise<FastifyInstance> {
  const server = Fastify({ logger: false });

  await server.register(fastifyStatic, {
    root: resolve('public'),
    prefix: '/',
  });

  server.get('/api/health', async () => ({ status: 'ok' }));

  server.get('/api/whatsapp/status', async () =>
    toConnectionStateDto(provider.getConnectionState()),
  );

  server.post('/api/whatsapp/connect', async (_request, reply) => {
    await provider.connect();
    return reply.code(202).send(await toConnectionStateDto(provider.getConnectionState()));
  });

  server.post('/api/whatsapp/disconnect', async () => {
    await provider.disconnect();
    return toConnectionStateDto(provider.getConnectionState());
  });

  server.get('/api/events', async (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream',
      'X-Accel-Buffering': 'no',
    });

    const sendState = async (): Promise<void> => {
      const dto = await toConnectionStateDto(provider.getConnectionState());
      reply.raw.write(`event: whatsapp-state\ndata: ${JSON.stringify(dto)}\n\n`);
    };

    const unsubscribe = provider.onConnectionState(() => {
      void sendState();
    });

    request.raw.once('close', unsubscribe);
  });

  return server;
}
