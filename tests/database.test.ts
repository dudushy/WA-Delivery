import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { openDatabase } from '../src/database/database.js';

describe('migrações do banco', () => {
  it('aplica a versão 5 sobre uma campanha preparada com destinatários', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wa-delivery-migration-'));
    const filename = join(directory, 'v4.db');
    const oldDatabase = new DatabaseSync(filename);
    try {
      oldDatabase.exec(`
        CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT);
        INSERT INTO schema_migrations (version, applied_at)
          VALUES (1, CURRENT_TIMESTAMP), (2, CURRENT_TIMESTAMP), (3, CURRENT_TIMESTAMP), (4, CURRENT_TIMESTAMP);
        CREATE TABLE campaigns (
          id INTEGER PRIMARY KEY, status TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE campaign_recipients (
          id INTEGER PRIMARY KEY,
          campaign_id INTEGER NOT NULL,
          source_contact_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          phone TEXT NOT NULL,
          rendered_message TEXT NOT NULL,
          status TEXT NOT NULL
        );
        INSERT INTO campaigns (id, status, updated_at) VALUES (1, 'ready', CURRENT_TIMESTAMP);
        INSERT INTO campaign_recipients (
          id, campaign_id, source_contact_id, name, phone, rendered_message, status
        ) VALUES (1, 1, 10, 'Ana', '5516999999999', 'Olá Ana!', 'pending');
      `);
    } finally {
      oldDatabase.close();
    }

    try {
      const migrated = openDatabase(filename);
      assert.equal(
        migrated.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()?.version,
        8,
      );
      const recipient = migrated.prepare(`
        SELECT attempt_count, updated_at FROM campaign_recipients WHERE id = 1
      `).get() as { attempt_count: number; updated_at: string | null };
      assert.equal(recipient.attempt_count, 0);
      assert.ok(recipient.updated_at);
      migrated.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('aplica a versão 6 sobre um banco já na versão 5 com campanhas', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wa-delivery-migration-v6-'));
    const filename = join(directory, 'v5.db');
    // Monta manualmente um banco parado na versão 5 (sem source_campaign_id),
    // populado com uma campanha, para exercitar o upgrade sobre dados reais.
    const oldDatabase = new DatabaseSync(filename);
    try {
      oldDatabase.exec(`
        CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT);
        INSERT INTO schema_migrations (version, applied_at) VALUES
          (1, CURRENT_TIMESTAMP), (2, CURRENT_TIMESTAMP), (3, CURRENT_TIMESTAMP),
          (4, CURRENT_TIMESTAMP), (5, CURRENT_TIMESTAMP);
        CREATE TABLE campaigns (
          id INTEGER PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE delivery_attempts (
          id INTEGER PRIMARY KEY, campaign_id INTEGER NOT NULL, recipient_id INTEGER NOT NULL,
          attempt_number INTEGER NOT NULL, outcome TEXT NOT NULL, message_id TEXT,
          error_message TEXT, created_at TEXT, finished_at TEXT
        );
        INSERT INTO campaigns (id, name, status, updated_at)
          VALUES (1, 'Campanha', 'completed', CURRENT_TIMESTAMP);
      `);
    } finally {
      oldDatabase.close();
    }

    try {
      const migrated = openDatabase(filename);
      assert.equal(
        migrated.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()?.version,
        8,
      );
      // A coluna nova existe e a campanha populada foi preservada.
      const row = migrated.prepare(
        'SELECT name, source_campaign_id FROM campaigns WHERE id = 1',
      ).get() as { name: string; source_campaign_id: number | null };
      assert.equal(row.name, 'Campanha');
      assert.equal(row.source_campaign_id, null);
      // A coluna aceita o vínculo de origem.
      migrated.prepare('UPDATE campaigns SET source_campaign_id = 1 WHERE id = 1').run();
      assert.equal(
        (migrated.prepare('SELECT source_campaign_id FROM campaigns WHERE id = 1').get() as { source_campaign_id: number }).source_campaign_id,
        1,
      );
      migrated.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('aplica a versão 7 sobre um banco na versão 6 com tentativas', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wa-delivery-migration-v7-'));
    const filename = join(directory, 'v6.db');
    // Monta um banco parado na versão 6 (delivery_attempts sem error_kind).
    const oldDatabase = new DatabaseSync(filename);
    try {
      oldDatabase.exec(`
        CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT);
        INSERT INTO schema_migrations (version, applied_at) VALUES
          (1, CURRENT_TIMESTAMP), (2, CURRENT_TIMESTAMP), (3, CURRENT_TIMESTAMP),
          (4, CURRENT_TIMESTAMP), (5, CURRENT_TIMESTAMP), (6, CURRENT_TIMESTAMP);
        CREATE TABLE delivery_attempts (
          id INTEGER PRIMARY KEY, campaign_id INTEGER NOT NULL, recipient_id INTEGER NOT NULL,
          attempt_number INTEGER NOT NULL, outcome TEXT NOT NULL, message_id TEXT,
          error_message TEXT, created_at TEXT, finished_at TEXT
        );
        INSERT INTO delivery_attempts (id, campaign_id, recipient_id, attempt_number, outcome, error_message)
          VALUES (1, 1, 1, 1, 'failed', 'erro anterior');
      `);
    } finally {
      oldDatabase.close();
    }

    try {
      const migrated = openDatabase(filename);
      assert.equal(
        migrated.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()?.version,
        8,
      );
      // A tentativa existente foi preservada e a coluna nova aceita a classificação.
      const before = migrated.prepare('SELECT error_kind FROM delivery_attempts WHERE id = 1').get() as { error_kind: string | null };
      assert.equal(before.error_kind, null);
      migrated.prepare("UPDATE delivery_attempts SET error_kind = 'transient' WHERE id = 1").run();
      assert.equal(
        (migrated.prepare('SELECT error_kind FROM delivery_attempts WHERE id = 1').get() as { error_kind: string }).error_kind,
        'transient',
      );
      migrated.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
