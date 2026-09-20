import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { openDatabase, LATEST_SCHEMA_VERSION } from './database/database.js';
import { SettingsRepository } from './modules/settings/SettingsRepository.js';
import { SettingsService } from './modules/settings/SettingsService.js';
import { ContactRepository } from './modules/contacts/ContactRepository.js';
import { ContactService } from './modules/contacts/ContactService.js';
import { CsvImportService } from './modules/contacts/CsvImportService.js';
import { CampaignRepository } from './modules/campaigns/CampaignRepository.js';
import { CampaignService } from './modules/campaigns/CampaignService.js';
import { MediaRepository } from './modules/media/MediaRepository.js';
import { MediaService } from './modules/media/MediaService.js';
import { CampaignQueueRepository } from './modules/queue/CampaignQueueRepository.js';
import {
  CampaignQueueWorker,
  DEFAULT_OPERATION_TIMEOUT_MS,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_RETRY_BACKOFF_MS,
  DEFAULT_RETRY_BACKOFF_CAP_MS,
} from './modules/queue/CampaignQueueWorker.js';
import { buildServer } from './web/server.js';
import { BackupService } from './modules/backup/BackupService.js';
import { logger } from './shared/logger.js';
import { BaileysWhatsAppProvider } from './providers/whatsapp/baileys/BaileysWhatsAppProvider.js';

/** Lê a versão da aplicação do package.json (para metadados de backup). */
function appVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const provider = new BaileysWhatsAppProvider({
  sessionDirectory: resolve('data/sessions/baileys'),
});
const dataDir = resolve('data');
const database = openDatabase(resolve('data/database/wa-delivery.db'));
const settings = new SettingsService(new SettingsRepository(database));
const contacts = new ContactService(new ContactRepository(database), settings);
const csvImports = new CsvImportService(contacts, settings);
const media = new MediaService(new MediaRepository(database), resolve('data/media'));
const campaigns = new CampaignService(new CampaignRepository(database), contacts, media);
const queue = new CampaignQueueWorker(
  new CampaignQueueRepository(database),
  campaigns,
  media,
  provider,
  Math.random,
  DEFAULT_OPERATION_TIMEOUT_MS,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_RETRY_BACKOFF_MS,
  DEFAULT_RETRY_BACKOFF_CAP_MS,
  settings,
);
queue.recoverInterrupted();
await media.cleanupExpiredTemporary();

// Backup/restauração do diretório data/. A restauração exige reinício da
// aplicação (decisão documentada): após restaurar, o processo é encerrado para
// que a próxima execução carregue o banco restaurado com segurança.
const backup = new BackupService(dataDir, appVersion(), LATEST_SCHEMA_VERSION, {
  // Consolida o WAL no arquivo principal antes de ler, evitando snapshot inconsistente.
  beforeCreate: () => {
    try {
      database.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    } catch (error) {
      logger.warn({ err: error }, 'Falha ao consolidar o WAL antes do backup.');
    }
  },
  // Para o worker e fecha o banco/provider antes de sobrescrever os dados.
  beforeRestore: async () => {
    queue.shutdown();
    try {
      database.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    } catch {
      // Ignora; o banco será fechado em seguida.
    }
    database.close();
    await provider.disconnect();
  },
});

const server = await buildServer({
  whatsappProvider: provider,
  settings,
  contacts,
  csvImports,
  campaigns,
  media,
  queue,
  backup,
  // Após restaurar, encerra para reiniciar limpo (RUN.bat/run.sh reabrem).
  onRestored: () => {
    logger.info('Backup restaurado; encerrando para reiniciar.');
    process.exit(0);
  },
});

async function shutdown(): Promise<void> {
  queue.shutdown();
  await server.close();
  await provider.disconnect();
  try {
    database.close();
  } catch {
    // Banco pode já ter sido fechado por uma restauração.
  }
  process.exit(0);
}

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());

server
  .listen({ host: '127.0.0.1', port: 3000 })
  .then(() => {
    // Mensagem amigável para o usuário final no terminal (RUN.bat/run.sh).
    // Os demais logs continuam estruturados; este é o "pronto para uso".
    console.log('\nWA-Delivery pronto! Abra http://localhost:3000 no navegador.\n');
  })
  .catch((error: unknown) => {
    logger.error({ err: error }, 'Não foi possível iniciar o WA-Delivery.');
    process.exitCode = 1;
  });

// Reconecta automaticamente ao iniciar somente se já houver uma sessão salva,
// evitando forçar um novo QR Code em uma instalação sem credenciais.
void provider.hasSavedSession().then((hasSession) => {
  if (hasSession) {
    void provider.connect().catch((error: unknown) => {
      logger.error({ err: error }, 'Não foi possível reconectar a sessão salva do WhatsApp.');
    });
  }
});
