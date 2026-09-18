import QRCode from 'qrcode';
import type { ConnectionState } from '../providers/whatsapp/WhatsAppProvider.js';

export interface ConnectionStateDto {
  status: ConnectionState['status'];
  qrCodeDataUrl?: string;
  error?: string;
}

export async function toConnectionStateDto(
  state: ConnectionState,
): Promise<ConnectionStateDto> {
  const qrCodeDataUrl = state.qrCode
    ? await QRCode.toDataURL(state.qrCode, { margin: 1, width: 320 })
    : undefined;

  return {
    status: state.status,
    ...(qrCodeDataUrl === undefined ? {} : { qrCodeDataUrl }),
    ...(state.error === undefined ? {} : { error: state.error }),
  };
}
