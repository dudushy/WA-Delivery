import { resolve } from 'node:path';
import qrcode from 'qrcode-terminal';
import { BaileysWhatsAppProvider } from './providers/whatsapp/baileys/BaileysWhatsAppProvider.js';

const provider = new BaileysWhatsAppProvider({
  sessionDirectory: resolve('data/sessions/baileys'),
});

provider.onConnectionState((state) => {
  switch (state.status) {
    case 'qr_pending':
      console.log('\nEscaneie o QR Code em WhatsApp > Dispositivos conectados:');
      if (state.qrCode) qrcode.generate(state.qrCode, { small: true });
      break;
    case 'connected':
      console.log('WhatsApp conectado. A sessão foi salva localmente.');
      break;
    case 'reconnecting':
      console.log('Conexão perdida. Tentando reconectar...');
      break;
    case 'logged_out':
    case 'error':
      console.error(state.error ?? `Estado da conexão: ${state.status}`);
      break;
    default:
      console.log(`Estado da conexão: ${state.status}`);
  }
});

async function shutdown(): Promise<void> {
  await provider.disconnect();
  process.exit(0);
}

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());

provider.connect().catch((error: unknown) => {
  console.error('Não foi possível iniciar a conexão com o WhatsApp.', error);
  process.exitCode = 1;
});
