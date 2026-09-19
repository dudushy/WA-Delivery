import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { openDatabase } from '../src/database/database.js';
import { CampaignRepository } from '../src/modules/campaigns/CampaignRepository.js';
import { CampaignService } from '../src/modules/campaigns/CampaignService.js';
import { ContactRepository } from '../src/modules/contacts/ContactRepository.js';
import { ContactService } from '../src/modules/contacts/ContactService.js';
import { MediaRepository } from '../src/modules/media/MediaRepository.js';
import { MediaService } from '../src/modules/media/MediaService.js';
import { CampaignQueueRepository } from '../src/modules/queue/CampaignQueueRepository.js';
import { CampaignQueueWorker } from '../src/modules/queue/CampaignQueueWorker.js';
import { QueueStateError } from '../src/modules/queue/queueTypes.js';
import type { ConnectionListener, ConnectionState, DeliveryResult, MediaMessage, WhatsAppProvider } from '../src/providers/whatsapp/WhatsAppProvider.js';

class QueueWhatsAppProvider implements WhatsAppProvider {
  public sent: string[] = [];
  public state: ConnectionState = { status: 'connected' };
  public registeredHandler: (phone: string) => Promise<boolean> = async () => true;
  public sendTextHandler: ((phone: string, message: string) => Promise<DeliveryResult>) | undefined;
  public async connect(): Promise<void> {}
  public async disconnect(): Promise<void> {}
  public getConnectionState(): ConnectionState { return this.state; }
  public onConnectionState(_listener: ConnectionListener): () => void { return () => undefined; }
  public async hasSavedSession(): Promise<boolean> { return false; }
  public async isRegisteredNumber(phone: string): Promise<boolean> { return this.registeredHandler(phone); }
  public async sendText(phone: string, message: string): Promise<DeliveryResult> {
    if (this.sendTextHandler) return this.sendTextHandler(phone, message);
    this.sent.push(phone);
    return { messageId: `message-${this.sent.length}`, sentAt: new Date() };
  }
  public async sendMedia(phone: string, _media: MediaMessage): Promise<DeliveryResult> {
    return this.sendText(phone, 'media');
  }
}

function setup(contactCount = 1, operationTimeoutMs?: number) {
  const database = openDatabase(':memory:');
  const contacts = new ContactService(new ContactRepository(database));
  const list = contacts.createManualList({
    name: 'Fila',
    contacts: Array.from({ length: contactCount }, (_, index) => ({
      name: `Contato ${index + 1}`,
      phone: `1699999999${index}`,
    })),
  });
  const media = new MediaService(new MediaRepository(database), '/tmp/wa-delivery-queue-tests');
  const campaigns = new CampaignService(new CampaignRepository(database), contacts, media);
  const draft = campaigns.createDraft({
    name: 'Campanha da fila', contactListId: list.id, messageTemplate: 'Olá {{nome}}!',
    delayMinSeconds: 1, delayMaxSeconds: 1,
  });
  campaigns.prepareDraft(draft.id, true);
  const provider = new QueueWhatsAppProvider();
  const repository = new CampaignQueueRepository(database);
  const worker = new CampaignQueueWorker(repository, campaigns, media, provider, () => 0, operationTimeoutMs);
  return { database, draft, provider, repository, worker };
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 100; index += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Tempo excedido aguardando a fila.');
}

describe('CampaignQueueWorker', () => {
  it('exige confirmação e conexão antes do envio real', () => {
    const { database, draft, provider, worker } = setup();
    try {
      assert.throws(() => worker.start(draft.id, false), QueueStateError);
      provider.state = { status: 'disconnected' };
      assert.throws(() => worker.start(draft.id, true), QueueStateError);
    } finally { database.close(); }
  });

  it('processa e registra um destinatário por vez', async () => {
    const { database, draft, provider, repository, worker } = setup();
    try {
      worker.start(draft.id, true);
      await waitUntil(() => repository.progress(draft.id)?.status === 'completed');
      const progress = repository.progress(draft.id);
      assert.equal(progress?.sent, 1);
      assert.equal(progress?.pending, 0);
      assert.equal(provider.sent.length, 1);
    } finally { worker.shutdown(); database.close(); }
  });

  it('pausa, retoma e cancela sem perder a fila persistida', async () => {
    const { database, draft, repository, worker } = setup(2);
    let paused = false;
    const unsubscribe = worker.onProgress((progress) => {
      if (!paused && progress.sent === 1 && progress.status === 'running') {
        paused = true;
        worker.pause(draft.id);
      }
    });
    try {
      worker.start(draft.id, true);
      await waitUntil(() => repository.progress(draft.id)?.status === 'paused');
      assert.equal(repository.progress(draft.id)?.pending, 1);
      worker.resume(draft.id);
      await waitUntil(() => repository.progress(draft.id)?.status === 'completed');
      assert.equal(repository.progress(draft.id)?.sent, 2);

      const second = setup(2);
      try {
        second.worker.cancel(second.draft.id);
        assert.equal(second.repository.progress(second.draft.id)?.status, 'cancelled');
        assert.equal(second.repository.progress(second.draft.id)?.skipped, 2);
      } finally { second.database.close(); }
    } finally {
      unsubscribe();
      worker.shutdown();
      database.close();
    }
  });

  it('classifica timeout de envio como falha transitória', async () => {
    const { database, draft, provider, repository, worker } = setup(1, 20);
    // O envio nunca resolve: força o timeout do worker.
    provider.sendTextHandler = () => new Promise<never>(() => {});
    try {
      worker.start(draft.id, true);
      await waitUntil(() => repository.progress(draft.id)?.failed === 1);
      const progress = repository.progress(draft.id);
      assert.equal(progress?.failed, 1);
      assert.equal(progress?.sent, 0);
      const row = database
        .prepare("SELECT last_error FROM campaign_recipients WHERE campaign_id = ?")
        .get(draft.id) as { last_error: string };
      assert.match(row.last_error, /^\[transient\]/);
      assert.match(row.last_error, /tempo limite/i);
    } finally { worker.shutdown(); database.close(); }
  });

  it('classifica número não registrado como skip sem falhar', async () => {
    const { database, draft, provider, repository, worker } = setup(1);
    provider.registeredHandler = async () => false;
    try {
      worker.start(draft.id, true);
      await waitUntil(() => repository.progress(draft.id)?.status === 'completed');
      const progress = repository.progress(draft.id);
      assert.equal(progress?.skipped, 1);
      assert.equal(progress?.failed, 0);
    } finally { worker.shutdown(); database.close(); }
  });

  it('classifica erro permanente de envio como falha permanente', async () => {
    const { database, draft, provider, repository, worker } = setup(1);
    provider.sendTextHandler = async () => {
      throw new Error('A mensagem não pode estar vazia.');
    };
    try {
      worker.start(draft.id, true);
      await waitUntil(() => repository.progress(draft.id)?.failed === 1);
      const row = database
        .prepare("SELECT last_error FROM campaign_recipients WHERE campaign_id = ?")
        .get(draft.id) as { last_error: string };
      assert.match(row.last_error, /^\[permanent\]/);
    } finally { worker.shutdown(); database.close(); }
  });
});
