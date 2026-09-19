import { EventEmitter } from 'node:events';
import { access, mkdir } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { dirname, join } from 'node:path';
import makeWASocket, {
  Browsers,
  type ConnectionState as BaileysConnectionState,
  type WASocket,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { toWhatsAppJid } from '../../../modules/contacts/phone.js';
import type {
  ConnectionListener,
  ConnectionState,
  DeliveryResult,
  MediaMessage,
  WhatsAppProvider,
} from '../WhatsAppProvider.js';
import { decideDisconnect } from './disconnect.js';

export interface BaileysProviderOptions {
  sessionDirectory: string;
  reconnectDelayMs?: number;
}

const CONNECTION_EVENT = 'connection-state';

export class BaileysWhatsAppProvider implements WhatsAppProvider {
  private readonly events = new EventEmitter();
  private readonly reconnectDelayMs: number;
  private socket: WASocket | undefined;
  private state: ConnectionState = { status: 'disconnected' };
  private reconnectTimer: NodeJS.Timeout | undefined;
  private intentionallyDisconnected = false;

  public constructor(private readonly options: BaileysProviderOptions) {
    this.reconnectDelayMs = options.reconnectDelayMs ?? 3_000;
  }

  public async connect(): Promise<void> {
    if (this.state.status === 'connecting' || this.state.status === 'connected') return;

    this.intentionallyDisconnected = false;
    this.clearReconnectTimer();
    this.setState({ status: 'connecting' });

    await mkdir(dirname(this.options.sessionDirectory), { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(this.options.sessionDirectory);
    const socket = makeWASocket({
      auth: state,
      browser: Browsers.macOS('Desktop'),
      logger: pino({ level: 'silent' }),
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });

    this.socket = socket;
    socket.ev.on('creds.update', saveCreds);
    socket.ev.on('connection.update', (update) => this.handleConnectionUpdate(socket, update));
  }

  public async disconnect(): Promise<void> {
    this.intentionallyDisconnected = true;
    this.clearReconnectTimer();
    this.socket?.end(undefined);
    this.socket = undefined;
    this.setState({ status: 'disconnected' });
  }

  public getConnectionState(): ConnectionState {
    return { ...this.state };
  }

  /**
   * Indica se já existe uma sessão salva localmente (arquivo de credenciais do
   * Baileys). Usado para decidir se a aplicação deve tentar reconectar
   * automaticamente ao iniciar, sem exigir um novo QR Code.
   */
  public async hasSavedSession(): Promise<boolean> {
    try {
      await access(join(this.options.sessionDirectory, 'creds.json'), fsConstants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  public onConnectionState(listener: ConnectionListener): () => void {
    this.events.on(CONNECTION_EVENT, listener);
    listener(this.getConnectionState());
    return () => this.events.off(CONNECTION_EVENT, listener);
  }

  public async isRegisteredNumber(phone: string): Promise<boolean> {
    const [result] =
      (await this.requireConnectedSocket().onWhatsApp(toWhatsAppJid(phone))) ?? [];
    return result?.exists === true;
  }

  public async sendText(phone: string, message: string): Promise<DeliveryResult> {
    if (!message.trim()) throw new Error('A mensagem não pode estar vazia.');

    const response = await this.requireConnectedSocket().sendMessage(toWhatsAppJid(phone), {
      text: message,
    });
    return this.toDeliveryResult(response?.key.id);
  }

  public async sendMedia(phone: string, media: MediaMessage): Promise<DeliveryResult> {
    const content = media.kind === 'image'
      ? {
          image: { url: media.path },
          ...(media.caption === undefined ? {} : { caption: media.caption }),
          ...(media.mimetype === undefined ? {} : { mimetype: media.mimetype }),
        }
      : {
          video: { url: media.path },
          ...(media.caption === undefined ? {} : { caption: media.caption }),
          ...(media.mimetype === undefined ? {} : { mimetype: media.mimetype }),
        };

    const response = await this.requireConnectedSocket().sendMessage(toWhatsAppJid(phone), content);
    return this.toDeliveryResult(response?.key.id);
  }

  private handleConnectionUpdate(socket: WASocket, update: Partial<BaileysConnectionState>): void {
    if (socket !== this.socket) return;
    if (update.qr) this.setState({ status: 'qr_pending', qrCode: update.qr });

    if (update.connection === 'open') {
      this.setState({ status: 'connected' });
      return;
    }
    if (update.connection !== 'close') return;

    this.socket = undefined;
    const decision = decideDisconnect(update.lastDisconnect?.error);
    if (decision.loggedOut) {
      this.setState({ status: 'logged_out', error: 'A sessão foi desconectada pelo WhatsApp.' });
      return;
    }

    if (!this.intentionallyDisconnected && decision.shouldReconnect) {
      this.setState({ status: 'reconnecting' });
      this.reconnectTimer = setTimeout(() => {
        void this.connect().catch((error: unknown) => {
          this.setState({ status: 'error', error: this.errorMessage(error) });
        });
      }, this.reconnectDelayMs);
      return;
    }

    this.setState({ status: 'disconnected' });
  }

  private requireConnectedSocket(): WASocket {
    if (!this.socket || this.state.status !== 'connected') {
      throw new Error('WhatsApp não está conectado.');
    }
    return this.socket;
  }

  private toDeliveryResult(messageId: string | null | undefined): DeliveryResult {
    if (!messageId) throw new Error('O WhatsApp não retornou o identificador da mensagem.');
    return { messageId, sentAt: new Date() };
  }

  private setState(state: ConnectionState): void {
    this.state = state;
    this.events.emit(CONNECTION_EVENT, this.getConnectionState());
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
