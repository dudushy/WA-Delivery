import type { DatabaseSync } from 'node:sqlite';
import type { CampaignComposerInput, CampaignSummary } from './campaignTypes.js';

interface CampaignRow {
  id: number;
  name: string;
  contact_list_id: number;
  contact_list_name: string;
  recipient_count: number;
  message_template: string;
  delay_min_seconds: number;
  delay_max_seconds: number;
  status: CampaignSummary['status'];
  created_at: string;
  updated_at: string;
  media_id: number | null;
  media_original_name: string | null;
  media_mimetype: string | null;
  media_kind: 'image' | 'video' | null;
  media_size_bytes: number | null;
}

export interface DeletedDraft {
  mediaStorageName?: string;
}

export class CampaignRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public createDraft(input: CampaignComposerInput & { name: string }): CampaignSummary {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const result = this.database.prepare(`
        INSERT INTO campaigns (
          name, contact_list_id, message_template, delay_min_seconds, delay_max_seconds, media_id
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        input.name,
        input.contactListId,
        input.messageTemplate,
        input.delayMinSeconds,
        input.delayMaxSeconds,
        input.mediaId ?? null,
      );
      if (input.mediaId !== undefined) {
        this.database.prepare("UPDATE media SET status = 'attached' WHERE id = ?").run(input.mediaId);
      }
      this.database.exec('COMMIT');
      const created = this.findById(Number(result.lastInsertRowid));
      if (!created) throw new Error('O rascunho criado não pôde ser recuperado.');
      return created;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  public list(): CampaignSummary[] {
    return (this.database.prepare(`${baseQuery()} ORDER BY campaigns.id DESC`).all() as unknown as CampaignRow[])
      .map(toSummary);
  }

  public findById(id: number): CampaignSummary | undefined {
    const row = this.database.prepare(baseQuery('WHERE campaigns.id = ?')).get(id) as unknown as CampaignRow | undefined;
    return row ? toSummary(row) : undefined;
  }

  public deleteDraft(id: number): DeletedDraft | undefined {
    const row = this.database.prepare(`
      SELECT campaigns.status, campaigns.media_id, media.storage_name
      FROM campaigns
      LEFT JOIN media ON media.id = campaigns.media_id
      WHERE campaigns.id = ?
    `).get(id) as {
      status: CampaignSummary['status'];
      media_id: number | null;
      storage_name: string | null;
    } | undefined;
    if (!row || row.status !== 'draft') return undefined;

    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database.prepare('DELETE FROM campaigns WHERE id = ?').run(id);
      if (row.media_id !== null) this.database.prepare('DELETE FROM media WHERE id = ?').run(row.media_id);
      this.database.exec('COMMIT');
      return {
        ...(row.storage_name === null ? {} : { mediaStorageName: row.storage_name }),
      };
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
}

function baseQuery(where = ''): string {
  return `
    SELECT
      campaigns.id,
      campaigns.name,
      campaigns.contact_list_id,
      lists.name AS contact_list_name,
      COUNT(members.id) AS recipient_count,
      campaigns.message_template,
      campaigns.delay_min_seconds,
      campaigns.delay_max_seconds,
      campaigns.status,
      campaigns.created_at,
      campaigns.updated_at
      , campaigns.media_id
      , media.original_name AS media_original_name
      , media.mimetype AS media_mimetype
      , media.kind AS media_kind
      , media.size_bytes AS media_size_bytes
    FROM campaigns
    JOIN contact_lists lists ON lists.id = campaigns.contact_list_id
    LEFT JOIN contact_list_members members ON members.contact_list_id = lists.id
    LEFT JOIN media ON media.id = campaigns.media_id
    ${where}
    GROUP BY campaigns.id
  `;
}

function toSummary(row: CampaignRow): CampaignSummary {
  return {
    id: row.id,
    name: row.name,
    contactListId: row.contact_list_id,
    contactListName: row.contact_list_name,
    recipientCount: row.recipient_count,
    messageTemplate: row.message_template,
    delayMinSeconds: row.delay_min_seconds,
    delayMaxSeconds: row.delay_max_seconds,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.media_id === null || row.media_original_name === null || row.media_mimetype === null
      || row.media_kind === null || row.media_size_bytes === null
      ? {}
      : {
          media: {
            id: row.media_id,
            originalName: row.media_original_name,
            mimetype: row.media_mimetype,
            kind: row.media_kind,
            sizeBytes: row.media_size_bytes,
          },
        }),
  };
}
