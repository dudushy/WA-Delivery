import { resolve } from 'node:path';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import type { ContactService } from '../modules/contacts/ContactService.js';
import type { CsvImportService } from '../modules/contacts/CsvImportService.js';
import type { CampaignService } from '../modules/campaigns/CampaignService.js';
import type { MediaService } from '../modules/media/MediaService.js';
import type { CampaignQueueWorker } from '../modules/queue/CampaignQueueWorker.js';
import type { SettingsService } from '../modules/settings/SettingsService.js';
import type { WhatsAppProvider } from '../providers/whatsapp/WhatsAppProvider.js';
import { toConnectionStateDto } from './connectionDto.js';
import { registerContactRoutes } from './contactRoutes.js';
import { registerCsvImportRoutes } from './csvImportRoutes.js';
import { registerCampaignRoutes } from './campaignRoutes.js';
import { registerMediaRoutes } from './mediaRoutes.js';
import { registerQueueRoutes } from './queueRoutes.js';
import { registerSettingsRoutes } from './settingsRoutes.js';

export interface ServerDependencies {
  whatsappProvider: WhatsAppProvider;
  settings: SettingsService;
  contacts: ContactService;
  csvImports: CsvImportService;
  campaigns: CampaignService;
  media: MediaService;
  queue: CampaignQueueWorker;
}

export async function buildServer(
  dependencies: ServerDependencies,
): Promise<FastifyInstance> {
  const server = Fastify({ logger: false });
  const { whatsappProvider, settings, contacts, csvImports, campaigns, media, queue } =
    dependencies;

  await server.register(fastifyMultipart, {
    limits: { files: 1, fileSize: 64 * 1024 * 1024 },
  });

  await server.register(fastifyStatic, {
    root: resolve('public'),
    prefix: '/',
  });

  server.get('/api/health', async () => ({ status: 'ok' }));

  server.get('/api/whatsapp/status', async () =>
    toConnectionStateDto(whatsappProvider.getConnectionState()),
  );

  server.post('/api/whatsapp/connect', async (_request, reply) => {
    await whatsappProvider.connect();
    return reply.code(202).send(
      await toConnectionStateDto(whatsappProvider.getConnectionState()),
    );
  });

  server.post('/api/whatsapp/disconnect', async () => {
    await whatsappProvider.disconnect();
    return toConnectionStateDto(whatsappProvider.getConnectionState());
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
      const dto = await toConnectionStateDto(whatsappProvider.getConnectionState());
      reply.raw.write(`event: whatsapp-state\ndata: ${JSON.stringify(dto)}\n\n`);
    };

    const unsubscribe = whatsappProvider.onConnectionState(() => {
      void sendState();
    });
    const unsubscribeProgress = queue.onProgress((progress) => {
      reply.raw.write(`event: campaign-progress\ndata: ${JSON.stringify(progress)}\n\n`);
    });

    request.raw.once('close', () => {
      unsubscribe();
      unsubscribeProgress();
    });
  });

  registerContactRoutes(server, contacts);
  registerCsvImportRoutes(server, csvImports);
  registerCampaignRoutes(server, campaigns);
  registerMediaRoutes(server, media);
  registerQueueRoutes(server, queue);
  registerSettingsRoutes(server, settings);

  return server;
}
