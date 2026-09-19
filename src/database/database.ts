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
      database
        .prepare('INSERT INTO schema_migrations (version) VALUES (?)')
        .run(migration.version);
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
] as const;
