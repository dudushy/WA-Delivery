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
import { CampaignQueueWorker, computeBackoffMs } from '../src/modules/queue/CampaignQueueWorker.js';
import { QueueStateError } from '../src/modules/queue/queueTypes.js';
import type { ConnectionListener, ConnectionState, DeliveryResult, MediaMessage, WhatsAppProvider } from '../src/providers/whatsapp/WhatsAppProvider.js';

class QueueWhatsAppProvider implements WhatsAppProvider {
  public sent: string[] = [];
  public state: ConnectionState = { status: 'connected' };
  public registeredHandler: (phone: string) => Promise<boolean> = async () => true;
  public sendTextHandler: ((phone: string, message: string) => Promise<DeliveryResult>) | undefined;
  private readonly listeners = new Set<ConnectionListener>();
  public async connect(): Promise<void> {}
  public async disconnect(): Promise<void> {}
  public getConnectionState(): ConnectionState { return this.state; }
  public onConnectionState(listener: ConnectionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  /** Emula uma mudança de estado da conexão notificando os assinantes. */
  public setConnectionState(state: ConnectionState): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
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

function setup(contactCount = 1, operationTimeoutMs?: number, maxAttempts?: number, backoffMs = 0) {
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
  const worker = new CampaignQueueWorker(repository, campaigns, media, provider, () => 0, operationTimeoutMs, maxAttempts, backoffMs, backoffMs);
  return { database, draft, provider, repository, worker };
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 500; index += 1) {
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

  it('repete falha transitória até o limite e então marca como falha', async () => {
    // maxAttempts = 2: 1 tentativa + 1 retry, depois falha definitiva.
    const { database, draft, provider, repository, worker } = setup(1, 20, 2);
    let attempts = 0;
    provider.sendTextHandler = async () => {
      attempts += 1;
      throw new Error('Connection closed'); // transitório
    };
    try {
      worker.start(draft.id, true);
      await waitUntil(() => repository.progress(draft.id)?.failed === 1);
      assert.equal(attempts, 2); // tentou exatamente maxAttempts vezes
      const attemptRows = database
        .prepare("SELECT outcome, error_kind FROM delivery_attempts WHERE campaign_id = ? ORDER BY id")
        .all(draft.id) as Array<{ outcome: string; error_kind: string | null }>;
      assert.equal(attemptRows.length, 2);
      assert.ok(attemptRows.every((r) => r.outcome === 'failed'));
      assert.ok(attemptRows.every((r) => r.error_kind === 'transient'));
      const recipient = database
        .prepare("SELECT status, attempt_count FROM campaign_recipients WHERE campaign_id = ?")
        .get(draft.id) as { status: string; attempt_count: number };
      assert.equal(recipient.status, 'failed');
      assert.equal(recipient.attempt_count, 2);
    } finally { worker.shutdown(); database.close(); }
  });

  it('reenvia após falha transitória e conclui quando o envio se recupera', async () => {
    const { database, draft, provider, repository, worker } = setup(1, 20, 3);
    let attempts = 0;
    provider.sendTextHandler = async (phone) => {
      attempts += 1;
      if (attempts === 1) throw new Error('socket hang up'); // transitório na 1ª
      provider.sent.push(phone);
      return { messageId: `message-${provider.sent.length}`, sentAt: new Date() };
    };
    try {
      worker.start(draft.id, true);
      await waitUntil(() => repository.progress(draft.id)?.status === 'completed');
      const progress = repository.progress(draft.id);
      assert.equal(progress?.sent, 1);
      assert.equal(progress?.failed, 0);
      assert.equal(attempts, 2); // falhou 1x, sucesso na 2ª
    } finally { worker.shutdown(); database.close(); }
  });
});

describe('CampaignQueueWorker disconnection', () => {
  it('pausa por queda de conexão e retoma automaticamente ao reconectar', async () => {
    const { database, draft, provider, repository, worker } = setup(2);
    let sends = 0;
    provider.sendTextHandler = async (phone) => {
      sends += 1;
      if (sends === 1) {
        // Após o primeiro envio, simula a queda da conexão (sem notificar ainda).
        provider.state = { status: 'disconnected' };
        provider.sent.push(phone);
        return { messageId: 'm1', sentAt: new Date() };
      }
      provider.sent.push(phone);
      return { messageId: `m${sends}`, sentAt: new Date() };
    };
    try {
      worker.start(draft.id, true);
      // A campanha deve pausar ao detectar a desconexão.
      await waitUntil(() => repository.progress(draft.id)?.status === 'paused');
      assert.equal(repository.progress(draft.id)?.sent, 1);
      // Reconecta: deve retomar automaticamente e concluir.
      provider.setConnectionState({ status: 'connected' });
      await waitUntil(() => repository.progress(draft.id)?.status === 'completed');
      assert.equal(repository.progress(draft.id)?.sent, 2);
    } finally { worker.shutdown(); database.close(); }
  });

  it('não retoma automaticamente uma campanha pausada manualmente', async () => {
    const { database, draft, provider, worker, repository } = setup(2);
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
      // Uma notificação de conexão não deve retomar uma pausa manual.
      provider.setConnectionState({ status: 'connected' });
      await new Promise((resolve) => setTimeout(resolve, 60));
      assert.equal(repository.progress(draft.id)?.status, 'paused');
    } finally { unsubscribe(); worker.shutdown(); database.close(); }
  });
});

describe('computeBackoffMs', () => {
  it('cresce exponencialmente a partir da base', () => {
    assert.equal(computeBackoffMs(1, 1_000, 30_000), 1_000);
    assert.equal(computeBackoffMs(2, 1_000, 30_000), 2_000);
    assert.equal(computeBackoffMs(3, 1_000, 30_000), 4_000);
    assert.equal(computeBackoffMs(4, 1_000, 30_000), 8_000);
  });

  it('respeita o teto', () => {
    assert.equal(computeBackoffMs(10, 1_000, 5_000), 5_000);
  });

  it('retorna 0 quando a base é 0 (backoff desativado)', () => {
    assert.equal(computeBackoffMs(3, 0, 30_000), 0);
  });
});

describe('CampaignQueueWorker backoff', () => {
  it('aguarda o backoff antes de reprocessar uma falha transitória', async () => {
    // base de 120ms, teto igual: o retry deve atrasar a conclusão.
    const { database, draft, provider, repository, worker } = setup(1, 20, 3, 120);
    let attempts = 0;
    provider.sendTextHandler = async (phone) => {
      attempts += 1;
      if (attempts === 1) throw new Error('Connection closed'); // transitório
      provider.sent.push(phone);
      return { messageId: `m-${provider.sent.length}`, sentAt: new Date() };
    };
    const startedAt = Date.now();
    try {
      worker.start(draft.id, true);
      await waitUntil(() => repository.progress(draft.id)?.status === 'completed');
      const elapsed = Date.now() - startedAt;
      // Deve ter aguardado ao menos o backoff (120ms) entre a falha e o sucesso.
      assert.ok(elapsed >= 100, `esperava atraso do backoff, teve ${elapsed}ms`);
      assert.equal(repository.progress(draft.id)?.sent, 1);
    } finally { worker.shutdown(); database.close(); }
  });
});
