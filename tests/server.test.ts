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
import { openDatabase } from '../src/database/database.js';
import { SettingsRepository } from '../src/modules/settings/SettingsRepository.js';
import { SettingsService } from '../src/modules/settings/SettingsService.js';
import { ContactRepository } from '../src/modules/contacts/ContactRepository.js';
import { ContactService } from '../src/modules/contacts/ContactService.js';
import { CsvImportService } from '../src/modules/contacts/CsvImportService.js';
import { CampaignRepository } from '../src/modules/campaigns/CampaignRepository.js';
import { CampaignService } from '../src/modules/campaigns/CampaignService.js';
import { MediaRepository } from '../src/modules/media/MediaRepository.js';
import { MediaService } from '../src/modules/media/MediaService.js';
import { CampaignQueueRepository } from '../src/modules/queue/CampaignQueueRepository.js';
import { CampaignQueueWorker } from '../src/modules/queue/CampaignQueueWorker.js';

class FakeWhatsAppProvider implements WhatsAppProvider {
  public connectCalls = 0;
  public disconnectCalls = 0;
  private state: ConnectionState = { status: 'disconnected' };

  public setConnected(): void {
    this.state = { status: 'connected' };
  }

  public async connect(): Promise<void> {
    this.connectCalls += 1;
    this.state = { status: 'connecting' };
  }
  public async disconnect(): Promise<void> {
    this.disconnectCalls += 1;
    this.state = { status: 'disconnected' };
  }
  public getConnectionState(): ConnectionState {
    return { ...this.state };
  }
  public onConnectionState(_listener: ConnectionListener): () => void {
    return () => undefined;
  }
  public async hasSavedSession(): Promise<boolean> {
    return false;
  }
  public async isRegisteredNumber(_phone: string): Promise<boolean> {
    return true;
  }
  public async sendText(_phone: string, _message: string): Promise<DeliveryResult> {
    return { messageId: 'text-id', sentAt: new Date() };
  }
  public async sendMedia(_phone: string, _media: MediaMessage): Promise<DeliveryResult> {
    return { messageId: 'media-id', sentAt: new Date() };
  }
}

describe('servidor local', () => {
  async function createServer(provider = new FakeWhatsAppProvider()) {
    const database = openDatabase(':memory:');
    const settings = new SettingsService(new SettingsRepository(database));
    const contacts = new ContactService(new ContactRepository(database), settings);
    const media = new MediaService(new MediaRepository(database), '/tmp/wa-delivery-server-tests');
    const campaigns = new CampaignService(new CampaignRepository(database), contacts, media);
    const queue = new CampaignQueueWorker(
      new CampaignQueueRepository(database),
      campaigns,
      media,
      provider,
      () => 0,
    );
    return buildServer({
      whatsappProvider: provider,
      settings,
      contacts,
      csvImports: new CsvImportService(contacts, settings),
      campaigns,
      media,
      queue,
    });
  }

  it('retorna health check', async () => {
    const server = await createServer();
    const response = await server.inject({ method: 'GET', url: '/api/health' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: 'ok' });
    await server.close();
  });

  it('consulta o estado do WhatsApp', async () => {
    const server = await createServer();
    const response = await server.inject({ method: 'GET', url: '/api/whatsapp/status' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: 'disconnected' });
    await server.close();
  });

  it('inicia e encerra a conexão somente por ação explícita', async () => {
    const provider = new FakeWhatsAppProvider();
    const server = await createServer(provider);

    const connectResponse = await server.inject({ method: 'POST', url: '/api/whatsapp/connect' });
    assert.equal(connectResponse.statusCode, 202);
    assert.equal(provider.connectCalls, 1);
    assert.deepEqual(connectResponse.json(), { status: 'connecting' });

    const disconnectResponse = await server.inject({
      method: 'POST',
      url: '/api/whatsapp/disconnect',
    });
    assert.equal(disconnectResponse.statusCode, 200);
    assert.equal(provider.disconnectCalls, 1);
    assert.deepEqual(disconnectResponse.json(), { status: 'disconnected' });
    await server.close();
  });

  it('serve a interface web local', async () => {
    const server = await createServer();
    const response = await server.inject({ method: 'GET', url: '/' });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /Conexão do WhatsApp/);
    await server.close();
  });

  it('serve o favicon da aplicação', async () => {
    const server = await createServer();
    const response = await server.inject({ method: 'GET', url: '/favicon.svg' });
    assert.equal(response.statusCode, 200);
    assert.match(response.headers['content-type'] ?? '', /image\/svg\+xml/);
    assert.match(response.body, /WA-Delivery/);
    await server.close();
  });

  it('cria e lista contatos manuais pela API', async () => {
    const server = await createServer();
    const created = await server.inject({
      method: 'POST',
      url: '/api/contact-lists/manual',
      payload: {
        name: 'Clientes da Andrea',
        contacts: [{ name: 'Maria', phone: '(16) 99999-9999' }],
      },
    });

    assert.equal(created.statusCode, 201);
    assert.equal(created.json().contacts[0].phone, '5516999999999');

    const lists = await server.inject({ method: 'GET', url: '/api/contact-lists' });
    assert.equal(lists.statusCode, 200);
    assert.equal(lists.json().items[0].contactCount, 1);
    await server.close();
  });

  it('retorna erros de validação estruturados', async () => {
    const server = await createServer();
    const response = await server.inject({
      method: 'POST',
      url: '/api/contact-lists/manual',
      payload: { name: '', contacts: [] },
    });

    assert.equal(response.statusCode, 422);
    assert.equal(response.json().issues.length, 2);
    await server.close();
  });

  it('recebe CSV multipart e devolve uma prévia', async () => {
    const server = await createServer();
    const boundary = 'wa-delivery-test-boundary';
    const csv = 'Nome;Telefone\r\nAna;16999999999\r\n';
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="clientes.csv"',
      'Content-Type: text/csv',
      '',
      csv,
      `--${boundary}--`,
      '',
    ].join('\r\n');
    const response = await server.inject({
      method: 'POST',
      url: '/api/contact-imports/preview',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().delimiter, ';');
    assert.equal(response.json().phoneCandidates[0].header, 'Telefone');
    await server.close();
  });

  it('gerencia lista e contatos persistidos pela API', async () => {
    const server = await createServer();
    const createdResponse = await server.inject({
      method: 'POST',
      url: '/api/contact-lists/manual',
      payload: { name: 'Lista', contacts: [{ name: 'Ana', phone: '16999999999' }] },
    });
    const created = createdResponse.json();

    const renamed = await server.inject({
      method: 'PATCH',
      url: `/api/contact-lists/${created.id}`,
      payload: { name: 'Lista renomeada' },
    });
    assert.equal(renamed.json().name, 'Lista renomeada');

    const added = await server.inject({
      method: 'POST',
      url: `/api/contact-lists/${created.id}/contacts`,
      payload: { name: 'Maria', phone: '16988888888' },
    });
    assert.equal(added.statusCode, 201);
    const maria = added
      .json()
      .contacts.find((contact: { name: string }) => contact.name === 'Maria');

    const edited = await server.inject({
      method: 'PUT',
      url: `/api/contact-lists/${created.id}/contacts/${maria.id}`,
      payload: { name: 'Maria Silva', phone: '16977777777' },
    });
    assert.equal(edited.json().contacts[1].name, 'Maria Silva');

    const removed = await server.inject({
      method: 'DELETE',
      url: `/api/contact-lists/${created.id}/contacts/${maria.id}`,
    });
    assert.equal(removed.json().contactCount, 1);

    const deleted = await server.inject({
      method: 'DELETE',
      url: `/api/contact-lists/${created.id}`,
    });
    assert.equal(deleted.statusCode, 204);
    await server.close();
  });

  it('simula e salva campanha como rascunho sem disparar mensagens', async () => {
    const provider = new FakeWhatsAppProvider();
    const server = await createServer(provider);
    const listResponse = await server.inject({
      method: 'POST',
      url: '/api/contact-lists/manual',
      payload: {
        name: 'Destinatários',
        contacts: [
          { name: 'Ana', phone: '16999999999' },
          { name: 'Maria', phone: '16988888888' },
        ],
      },
    });
    const listId = listResponse.json().id;
    const payload = {
      name: 'Rascunho',
      contactListId: listId,
      messageTemplate: 'Olá {{nome}}!',
      delayMinSeconds: 5,
      delayMaxSeconds: 9,
    };

    const simulation = await server.inject({
      method: 'POST',
      url: '/api/campaigns/simulate',
      payload,
    });
    assert.equal(simulation.statusCode, 200);
    assert.equal(simulation.json().recipientCount, 2);

    const draft = await server.inject({ method: 'POST', url: '/api/campaigns', payload });
    assert.equal(draft.statusCode, 201);
    assert.equal(draft.json().status, 'draft');

    const edited = await server.inject({
      method: 'PUT',
      url: `/api/campaigns/${draft.json().id}`,
      payload: { ...payload, name: 'Rascunho editado', delayMinSeconds: 3 },
    });
    assert.equal(edited.statusCode, 200);
    assert.equal(edited.json().name, 'Rascunho editado');
    assert.equal(edited.json().delayMinSeconds, 3);

    const unconfirmed = await server.inject({
      method: 'POST',
      url: `/api/campaigns/${draft.json().id}/prepare`,
      payload: { confirmed: false },
    });
    assert.equal(unconfirmed.statusCode, 422);

    const prepared = await server.inject({
      method: 'POST',
      url: `/api/campaigns/${draft.json().id}/prepare`,
      payload: { confirmed: true },
    });
    assert.equal(prepared.statusCode, 200);
    assert.equal(prepared.json().campaign.status, 'ready');
    assert.equal(prepared.json().recipients.length, 2);
    assert.equal(prepared.json().recipients[0].renderedMessage, 'Olá Ana!');
    assert.equal(provider.connectCalls, 0);
    await server.close();
  });

  it('recebe mídia e a vincula ao rascunho', async () => {
    const server = await createServer();
    const boundary = 'wa-delivery-media-boundary';
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="foto.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      png,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const upload = await server.inject({
      method: 'POST',
      url: '/api/media',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    assert.equal(upload.statusCode, 201);

    const list = await server.inject({
      method: 'POST',
      url: '/api/contact-lists/manual',
      payload: { name: 'Lista com mídia', contacts: [{ name: 'Ana', phone: '16999999999' }] },
    });
    const draft = await server.inject({
      method: 'POST',
      url: '/api/campaigns',
      payload: {
        name: 'Rascunho com foto',
        contactListId: list.json().id,
        messageTemplate: 'Olá {{nome}}!',
        delayMinSeconds: 2,
        delayMaxSeconds: 4,
        mediaId: upload.json().id,
      },
    });
    assert.equal(draft.statusCode, 201);
    assert.equal(draft.json().media.originalName, 'foto.png');

    const mediaResponse = await server.inject({ method: 'GET', url: upload.json().previewUrl });
    assert.equal(mediaResponse.statusCode, 200);
    assert.equal(mediaResponse.headers['content-type'], 'image/png');

    const removed = await server.inject({
      method: 'DELETE',
      url: `/api/campaigns/${draft.json().id}`,
    });
    assert.equal(removed.statusCode, 204);
    const missingMedia = await server.inject({ method: 'GET', url: upload.json().previewUrl });
    assert.equal(missingMedia.statusCode, 404);
    await server.close();
  });

  it('exporta os destinatários de uma campanha em CSV', async () => {
    const server = await createServer();
    const list = await server.inject({
      method: 'POST',
      url: '/api/contact-lists/manual',
      payload: { name: 'Lista export', contacts: [{ name: 'Ana', phone: '16999999999' }] },
    });
    const draft = await server.inject({
      method: 'POST',
      url: '/api/campaigns',
      payload: {
        name: 'Campanha export',
        contactListId: list.json().id,
        messageTemplate: 'Olá {{nome}}!',
        delayMinSeconds: 2,
        delayMaxSeconds: 4,
      },
    });
    const id = draft.json().id;
    await server.inject({
      method: 'POST',
      url: `/api/campaigns/${id}/prepare`,
      payload: { confirmed: true },
    });

    const csv = await server.inject({ method: 'GET', url: `/api/campaigns/${id}/export` });
    assert.equal(csv.statusCode, 200);
    assert.ok(csv.headers['content-type']?.includes('text/csv'));
    assert.ok(csv.headers['content-disposition']?.includes(`campanha-${id}.csv`));
    assert.ok(csv.body.startsWith('nome,telefone,status,tentativas,enviado_em,ultimo_erro'));

    const failures = await server.inject({
      method: 'GET',
      url: `/api/campaigns/${id}/export?onlyFailures=true`,
    });
    assert.equal(failures.statusCode, 200);
    assert.ok(failures.headers['content-disposition']?.includes(`campanha-${id}-falhas.csv`));

    const missing = await server.inject({ method: 'GET', url: '/api/campaigns/999999/export' });
    assert.equal(missing.statusCode, 404);
    await server.close();
  });

  it('lê e grava configurações operacionais pela API', async () => {
    const server = await createServer();
    const defaults = await server.inject({ method: 'GET', url: '/api/settings' });
    assert.equal(defaults.statusCode, 200);
    assert.equal(defaults.json().defaultCountryCode, '55');
    assert.equal(defaults.json().maxAttempts, 3);

    const updated = await server.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: {
        defaultCountryCode: '1',
        defaultAreaCode: '11',
        maxAttempts: 5,
        soundEnabled: false,
      },
    });
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.json().defaultCountryCode, '1');
    assert.equal(updated.json().defaultAreaCode, '11');
    assert.equal(updated.json().maxAttempts, 5);
    assert.equal(updated.json().soundEnabled, false);

    // Persistiu: uma nova leitura reflete os valores salvos.
    const reread = await server.inject({ method: 'GET', url: '/api/settings' });
    assert.equal(reread.json().maxAttempts, 5);

    await server.close();
  });

  it('retorna 422 para configurações inválidas', async () => {
    const server = await createServer();
    const invalid = await server.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { maxAttempts: 0, defaultCountryCode: 'abc' },
    });
    assert.equal(invalid.statusCode, 422);
    assert.ok(Array.isArray(invalid.json().issues));
    assert.ok(invalid.json().issues.length >= 1);
    await server.close();
  });

  it('recusa limpeza por retenção quando desativada e aceita quando configurada', async () => {
    const server = await createServer();
    const disabled = await server.inject({ method: 'POST', url: '/api/campaigns/cleanup' });
    assert.equal(disabled.statusCode, 422);

    await server.inject({ method: 'PUT', url: '/api/settings', payload: { retentionDays: 30 } });
    const enabled = await server.inject({ method: 'POST', url: '/api/campaigns/cleanup' });
    assert.equal(enabled.statusCode, 200);
    assert.equal(enabled.json().retentionDays, 30);
    assert.equal(enabled.json().removed, 0);
    await server.close();
  });

  it('persiste o estado de onboarding concluído', async () => {
    const server = await createServer();
    const before = await server.inject({ method: 'GET', url: '/api/settings' });
    assert.equal(before.json().onboardingCompleted, false);

    const updated = await server.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { onboardingCompleted: true },
    });
    assert.equal(updated.json().onboardingCompleted, true);

    const after = await server.inject({ method: 'GET', url: '/api/settings' });
    assert.equal(after.json().onboardingCompleted, true);
    await server.close();
  });

  it('aplica o país/DDD configurado na normalização de contatos manuais', async () => {
    const server = await createServer();
    await server.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { defaultCountryCode: '55', defaultAreaCode: '16' },
    });
    // Número local sem DDD deve receber DDD (16) e país (55).
    const created = await server.inject({
      method: 'POST',
      url: '/api/contact-lists/manual',
      payload: { name: 'Sem DDD', contacts: [{ name: 'Ana', phone: '99999-9999' }] },
    });
    assert.equal(created.statusCode, 201);
    assert.equal(created.json().contacts[0].phone, '5516999999999');
    await server.close();
  });
});
