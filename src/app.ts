import { resolve } from 'node:path';
import { buildServer } from './web/server.js';
import { BaileysWhatsAppProvider } from './providers/whatsapp/baileys/BaileysWhatsAppProvider.js';

const provider = new BaileysWhatsAppProvider({
  sessionDirectory: resolve('data/sessions/baileys'),
});

const server = await buildServer(provider);

async function shutdown(): Promise<void> {
  await server.close();
  await provider.disconnect();
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
