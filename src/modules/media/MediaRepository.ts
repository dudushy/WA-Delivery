import type { DatabaseSync } from 'node:sqlite';
import type { MediaKind, StoredMedia } from './mediaTypes.js';

interface MediaRow {
  id: number;
  original_name: string;
  storage_name: string;
  mimetype: string;
  kind: MediaKind;
  size_bytes: number;
  status: StoredMedia['status'];
  created_at: string;
}

export class MediaRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public create(input: {
    originalName: string;
    storageName: string;
    mimetype: string;
    kind: MediaKind;
    sizeBytes: number;
  }): StoredMedia {
    const result = this.database
      .prepare(
        `
      INSERT INTO media (original_name, storage_name, mimetype, kind, size_bytes)
      VALUES (?, ?, ?, ?, ?)
    `,
      )
      .run(input.originalName, input.storageName, input.mimetype, input.kind, input.sizeBytes);
    const created = this.findById(Number(result.lastInsertRowid));
    if (!created) throw new Error('A mídia salva não pôde ser recuperada.');
    return created;
  }

  public findById(id: number): StoredMedia | undefined {
    const row = this.database.prepare('SELECT * FROM media WHERE id = ?').get(id) as unknown as
      MediaRow | undefined;
    return row ? toStoredMedia(row) : undefined;
  }

  public findExpiredTemporary(cutoffIso: string): StoredMedia[] {
    return (
      this.database
        .prepare(
          `
      SELECT * FROM media WHERE status = 'temporary' AND created_at < ?
    `,
        )
        .all(cutoffIso) as unknown as MediaRow[]
    ).map(toStoredMedia);
  }

  public delete(id: number): boolean {
    return this.database.prepare('DELETE FROM media WHERE id = ?').run(id).changes > 0;
  }
}

function toStoredMedia(row: MediaRow): StoredMedia {
  return {
    id: row.id,
    originalName: row.original_name,
    storageName: row.storage_name,
    mimetype: row.mimetype,
    kind: row.kind,
    sizeBytes: row.size_bytes,
    status: row.status,
    createdAt: row.created_at,
  };
}
