import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function openDatabase(filename: string): DatabaseSync {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });

  const database = new DatabaseSync(filename);
  database.exec('PRAGMA foreign_keys = ON');
  if (filename !== ':memory:') database.exec('PRAGMA journal_mode = WAL');
  migrate(database);
  return database;
}

function migrate(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const appliedVersions = new Set(
    database
      .prepare('SELECT version FROM schema_migrations ORDER BY version')
      .all()
      .map((row) => Number(row.version)),
  );

  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) continue;

    database.exec('BEGIN IMMEDIATE');
    try {
      database.exec(migration.sql);
      database.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(migration.version);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }
}

const migrations = [
  {
    version: 1,
    sql: `
      CREATE TABLE contact_lists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('manual', 'csv')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        normalized_phone TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE contact_list_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contact_list_id INTEGER NOT NULL REFERENCES contact_lists(id) ON DELETE CASCADE,
        contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE RESTRICT,
        name TEXT NOT NULL,
        source_data_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (contact_list_id, contact_id)
      );

      CREATE INDEX idx_contact_list_members_list
        ON contact_list_members(contact_list_id);
    `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE campaigns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        contact_list_id INTEGER NOT NULL REFERENCES contact_lists(id) ON DELETE RESTRICT,
        message_template TEXT NOT NULL,
        delay_min_seconds INTEGER NOT NULL,
        delay_max_seconds INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'running', 'paused', 'completed', 'cancelled', 'failed')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_campaigns_contact_list ON campaigns(contact_list_id);
      CREATE INDEX idx_campaigns_status ON campaigns(status);
    `,
  },
  {
    version: 3,
    sql: `
      CREATE TABLE media (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        storage_name TEXT NOT NULL UNIQUE,
        original_name TEXT NOT NULL,
        mimetype TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('image', 'video')),
        size_bytes INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'temporary' CHECK (status IN ('temporary', 'attached')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE campaigns ADD COLUMN media_id INTEGER REFERENCES media(id) ON DELETE SET NULL;
      CREATE INDEX idx_media_status_created ON media(status, created_at);
    `,
  },
  {
    version: 4,
    sql: `
      ALTER TABLE campaigns ADD COLUMN prepared_at TEXT;

      CREATE TABLE campaign_recipients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        source_contact_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        rendered_message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (campaign_id, phone)
      );

      CREATE INDEX idx_campaign_recipients_campaign_status
        ON campaign_recipients(campaign_id, status);
    `,
  },
  {
    version: 5,
    sql: `
      ALTER TABLE campaigns ADD COLUMN started_at TEXT;
      ALTER TABLE campaigns ADD COLUMN finished_at TEXT;
      ALTER TABLE campaign_recipients ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE campaign_recipients ADD COLUMN message_id TEXT;
      ALTER TABLE campaign_recipients ADD COLUMN sent_at TEXT;
      ALTER TABLE campaign_recipients ADD COLUMN last_error TEXT;
      ALTER TABLE campaign_recipients ADD COLUMN updated_at TEXT;
      UPDATE campaign_recipients SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL;

      CREATE TABLE delivery_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        recipient_id INTEGER NOT NULL REFERENCES campaign_recipients(id) ON DELETE CASCADE,
        attempt_number INTEGER NOT NULL,
        outcome TEXT NOT NULL CHECK (outcome IN ('sending', 'sent', 'failed', 'skipped')),
        message_id TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        finished_at TEXT
      );

      CREATE INDEX idx_delivery_attempts_campaign ON delivery_attempts(campaign_id, id);
    `,
  },
  {
    version: 6,
    sql: `
      ALTER TABLE campaigns ADD COLUMN source_campaign_id INTEGER
        REFERENCES campaigns(id) ON DELETE SET NULL;
      CREATE INDEX idx_campaigns_source ON campaigns(source_campaign_id);
    `,
  },
  {
    version: 7,
    sql: `
      ALTER TABLE delivery_attempts ADD COLUMN error_kind TEXT
        CHECK (error_kind IN ('transient', 'permanent'));
    `,
  },
  {
    version: 8,
    sql: `
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `,
  },
  {
    version: 9,
    sql: `
      ALTER TABLE contacts ADD COLUMN opted_out INTEGER NOT NULL DEFAULT 0
        CHECK (opted_out IN (0, 1));
    `,
  },
] as const;

/** Versão de schema mais recente conhecida (maior versão de migration). */
export const LATEST_SCHEMA_VERSION = migrations.reduce(
  (max, migration) => Math.max(max, migration.version),
  0,
);
