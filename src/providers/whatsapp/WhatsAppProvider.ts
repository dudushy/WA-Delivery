export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'qr_pending'
  | 'connected'
  | 'reconnecting'
  | 'logged_out'
  | 'error';

export interface ConnectionState {
  status: ConnectionStatus;
  qrCode?: string;
  error?: string;
}

export interface DeliveryResult {
  messageId: string;
  sentAt: Date;
}

export type MediaKind = 'image' | 'video';

export interface MediaMessage {
  path: string;
  kind: MediaKind;
  caption?: string;
  mimetype?: string;
}

export type ConnectionListener = (state: ConnectionState) => void;

export interface WhatsAppProvider {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getConnectionState(): ConnectionState;
  onConnectionState(listener: ConnectionListener): () => void;
  isRegisteredNumber(phone: string): Promise<boolean>;
  sendText(phone: string, message: string): Promise<DeliveryResult>;
  sendMedia(phone: string, media: MediaMessage): Promise<DeliveryResult>;
}
