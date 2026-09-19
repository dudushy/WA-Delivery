import { resolve } from 'node:path';
import { openDatabase } from './database/database.js';
import { ContactRepository } from './modules/contacts/ContactRepository.js';
import { ContactService } from './modules/contacts/ContactService.js';
import { CsvImportService } from './modules/contacts/CsvImportService.js';
import { CampaignRepository } from './modules/campaigns/CampaignRepository.js';
import { CampaignService } from './modules/campaigns/CampaignService.js';
import { MediaRepository } from './modules/media/MediaRepository.js';
import { MediaService } from './modules/media/MediaService.js';
import { CampaignQueueRepository } from './modules/queue/CampaignQueueRepository.js';
import { CampaignQueueWorker } from './modules/queue/CampaignQueueWorker.js';
import { buildServer } from './web/server.js';
import { BaileysWhatsAppProvider } from './providers/whatsapp/baileys/BaileysWhatsAppProvider.js';

const provider = new BaileysWhatsAppProvider({
  sessionDirectory: resolve('data/sessions/baileys'),
});
const database = openDatabase(resolve('data/database/wa-delivery.db'));
const contacts = new ContactService(new ContactRepository(database));
const csvImports = new CsvImportService(contacts);
const media = new MediaService(new MediaRepository(database), resolve('data/media'));
const campaigns = new CampaignService(new CampaignRepository(database), contacts, media);
const queue = new CampaignQueueWorker(
  new CampaignQueueRepository(database), campaigns, media, provider,
);
queue.recoverInterrupted();
await media.cleanupExpiredTemporary();

const server = await buildServer({
  whatsappProvider: provider,
  contacts,
  csvImports,
  campaigns,
  media,
  queue,
});

async function shutdown(): Promise<void> {
  queue.shutdown();
  await server.close();
  await provider.disconnect();
  database.close();
  process.exit(0);
}

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());

server.listen({ host: '127.0.0.1', port: 3000 }).then(() => {
  console.log('WA-Delivery disponível em http://localhost:3000');
}).catch((error: unknown) => {
  console.error('Não foi possível iniciar o WA-Delivery.', error);
  process.exitCode = 1;
});
