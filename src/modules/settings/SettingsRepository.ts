import type { DatabaseSync } from 'node:sqlite';

interface SettingRow {
  key: string;
  value: string;
}

/**
 * Armazena as configurações como pares chave/valor no SQLite. Os valores são
 * serializados como texto e reidratados pelo {@link SettingsService}.
 */
export class SettingsRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public getAll(): Record<string, string> {
    const rows = this.database
      .prepare('SELECT key, value FROM settings')
      .all() as unknown as SettingRow[];
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  }

  /** Grava um conjunto de pares chave/valor em uma única transação (upsert). */
  public setAll(values: Record<string, string>): void {
    const statement = this.database.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `);
    this.database.exec('BEGIN IMMEDIATE');
    try {
      for (const [key, value] of Object.entries(values)) statement.run(key, value);
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
}
