import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type {
  ConnectionListener,
  ConnectionState,
  DeliveryResult,
  MediaMessage,
  WhatsAppProvider,
} from '../src/providers/whatsapp/WhatsAppProvider.js';
import { buildServer } from '../src/web/server.js';

class FakeWhatsAppProvider implements WhatsAppProvider {
  public connectCalls = 0;
  public disconnectCalls = 0;
  private state: ConnectionState = { status: 'disconnected' };

  public async connect(): Promise<void> {
    this.connectCalls += 1;
    this.state = { status: 'connecting' };
  }
  public async disconnect(): Promise<void> {
    this.disconnectCalls += 1;
    this.state = { status: 'disconnected' };
  }
  public getConnectionState(): ConnectionState { return { ...this.state }; }
  public onConnectionState(_listener: ConnectionListener): () => void { return () => undefined; }
  public async isRegisteredNumber(_phone: string): Promise<boolean> { return true; }
  public async sendText(_phone: string, _message: string): Promise<DeliveryResult> {
    return { messageId: 'text-id', sentAt: new Date() };
  }
  public async sendMedia(_phone: string, _media: MediaMessage): Promise<DeliveryResult> {
    return { messageId: 'media-id', sentAt: new Date() };
  }
}

describe('servidor local', () => {
  it('retorna health check', async () => {
    const server = await buildServer(new FakeWhatsAppProvider());
    const response = await server.inject({ method: 'GET', url: '/api/health' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: 'ok' });
    await server.close();
  });

  it('consulta o estado do WhatsApp', async () => {
    const server = await buildServer(new FakeWhatsAppProvider());
    const response = await server.inject({ method: 'GET', url: '/api/whatsapp/status' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: 'disconnected' });
    await server.close();
  });

  it('inicia e encerra a conexão somente por ação explícita', async () => {
    const provider = new FakeWhatsAppProvider();
    const server = await buildServer(provider);

    const connectResponse = await server.inject({ method: 'POST', url: '/api/whatsapp/connect' });
    assert.equal(connectResponse.statusCode, 202);
    assert.equal(provider.connectCalls, 1);
    assert.deepEqual(connectResponse.json(), { status: 'connecting' });

    const disconnectResponse = await server.inject({ method: 'POST', url: '/api/whatsapp/disconnect' });
    assert.equal(disconnectResponse.statusCode, 200);
    assert.equal(provider.disconnectCalls, 1);
    assert.deepEqual(disconnectResponse.json(), { status: 'disconnected' });
    await server.close();
  });

  it('serve a interface web local', async () => {
    const server = await buildServer(new FakeWhatsAppProvider());
    const response = await server.inject({ method: 'GET', url: '/' });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /Conexão do WhatsApp/);
    await server.close();
  });
});
