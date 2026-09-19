import type { DatabaseSync } from 'node:sqlite';
import type {
  CampaignComposerInput,
  CampaignRecipientSnapshot,
  CampaignSummary,
} from './campaignTypes.js';

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
  prepared_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  source_campaign_id: number | null;
  media_id: number | null;
  media_original_name: string | null;
  media_mimetype: string | null;
  media_kind: 'image' | 'video' | null;
  media_size_bytes: number | null;
}

export interface DeletedDraft {
  mediaStorageName?: string;
}

export interface UpdatedDraft {
  campaign: CampaignSummary;
  removedMediaStorageName?: string;
}

interface RecipientRow {
  id: number;
  campaign_id: number;
  source_contact_id: number;
  name: string;
  phone: string;
  rendered_message: string;
  status: CampaignRecipientSnapshot['status'];
  attempt_count: number;
  last_error: string | null;
  sent_at: string | null;
  updated_at: string | null;
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

  public updateDraft(
    id: number,
    input: CampaignComposerInput & { name: string },
  ): UpdatedDraft | undefined {
    const existing = this.database.prepare(`
      SELECT campaigns.status, campaigns.media_id, media.storage_name
      FROM campaigns
      LEFT JOIN media ON media.id = campaigns.media_id
      WHERE campaigns.id = ?
    `).get(id) as {
      status: CampaignSummary['status'];
      media_id: number | null;
      storage_name: string | null;
    } | undefined;
    if (!existing || existing.status !== 'draft') return undefined;

    const nextMediaId = input.mediaId ?? null;
    const mediaChanged = existing.media_id !== nextMediaId;
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database.prepare(`
        UPDATE campaigns
        SET name = ?, contact_list_id = ?, message_template = ?, delay_min_seconds = ?,
            delay_max_seconds = ?, media_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'draft'
      `).run(
        input.name,
        input.contactListId,
        input.messageTemplate,
        input.delayMinSeconds,
        input.delayMaxSeconds,
        nextMediaId,
        id,
      );
      if (mediaChanged && nextMediaId !== null) {
        this.database.prepare("UPDATE media SET status = 'attached' WHERE id = ?").run(nextMediaId);
      }
      if (mediaChanged && existing.media_id !== null) {
        this.database.prepare('DELETE FROM media WHERE id = ?').run(existing.media_id);
      }
      this.database.exec('COMMIT');
      const campaign = this.findById(id);
      if (!campaign) throw new Error('O rascunho atualizado não pôde ser recuperado.');
      return {
        campaign,
        ...(mediaChanged && existing.storage_name
          ? { removedMediaStorageName: existing.storage_name }
          : {}),
      };
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  public prepareDraft(
    id: number,
    recipients: Array<{
      sourceContactId: number;
      name: string;
      phone: string;
      renderedMessage: string;
    }>,
  ): CampaignSummary | undefined {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const updated = this.database.prepare(`
        UPDATE campaigns SET status = 'ready', prepared_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'draft'
      `).run(id);
      if (updated.changes === 0) {
        this.database.exec('ROLLBACK');
        return undefined;
      }
      const insert = this.database.prepare(`
        INSERT INTO campaign_recipients (
          campaign_id, source_contact_id, name, phone, rendered_message
        ) VALUES (?, ?, ?, ?, ?)
      `);
      for (const recipient of recipients) {
        insert.run(
          id,
          recipient.sourceContactId,
          recipient.name,
          recipient.phone,
          recipient.renderedMessage,
        );
      }
      this.database.exec('COMMIT');
      return this.findById(id);
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  public listRecipients(campaignId: number): CampaignRecipientSnapshot[] {
    return (this.database.prepare(`
      SELECT id, campaign_id, source_contact_id, name, phone, rendered_message, status,
        attempt_count, last_error, sent_at, updated_at
      FROM campaign_recipients WHERE campaign_id = ? ORDER BY id
    `).all(campaignId) as unknown as RecipientRow[]).map((row) => ({
      id: row.id,
      campaignId: row.campaign_id,
      sourceContactId: row.source_contact_id,
      name: row.name,
      phone: row.phone,
      renderedMessage: row.rendered_message,
      status: row.status,
      attemptCount: row.attempt_count,
      ...(row.last_error === null ? {} : { lastError: row.last_error }),
      ...(row.sent_at === null ? {} : { sentAt: row.sent_at }),
      ...(row.updated_at === null ? {} : { updatedAt: row.updated_at }),
    }));
  }

  public deleteCampaign(id: number): DeletedDraft | undefined {
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
    // Uma campanha em execução não pode ser excluída; cancele-a antes.
    if (!row || row.status === 'running') return undefined;

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

  /**
   * Cria uma nova campanha vinculada a uma campanha de origem, já preparada
   * (status 'ready') e contendo apenas os destinatários informados como
   * pendentes, como snapshot imutável. A campanha de origem permanece intacta
   * como histórico. A mídia da origem, se houver, é reaproveitada.
   */
  public createFollowUp(
    source: CampaignSummary,
    pending: Array<{
      sourceContactId: number;
      name: string;
      phone: string;
      renderedMessage: string;
    }>,
  ): CampaignSummary {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const result = this.database.prepare(`
        INSERT INTO campaigns (
          name, contact_list_id, message_template, delay_min_seconds, delay_max_seconds,
          media_id, source_campaign_id, status, prepared_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ready', CURRENT_TIMESTAMP)
      `).run(
        `${source.name} (reenvio)`,
        source.contactListId,
        source.messageTemplate,
        source.delayMinSeconds,
        source.delayMaxSeconds,
        source.media?.id ?? null,
        source.id,
      );
      const newId = Number(result.lastInsertRowid);
      if (source.media?.id !== undefined) {
        this.database.prepare("UPDATE media SET status = 'attached' WHERE id = ?").run(source.media.id);
      }
      const insert = this.database.prepare(`
        INSERT INTO campaign_recipients (
          campaign_id, source_contact_id, name, phone, rendered_message
        ) VALUES (?, ?, ?, ?, ?)
      `);
      for (const recipient of pending) {
        insert.run(newId, recipient.sourceContactId, recipient.name, recipient.phone, recipient.renderedMessage);
      }
      this.database.exec('COMMIT');
      const created = this.findById(newId);
      if (!created) throw new Error('A campanha de reenvio não pôde ser recuperada.');
      return created;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  /**
   * Remove campanhas finalizadas (completed/cancelled/failed) cujo término
   * ocorreu há mais de `retentionDays` dias. Retorna o storage das mídias
   * removidas para limpeza no serviço. Nunca remove campanhas ativas.
   */
  public deleteFinishedBefore(retentionDays: number): { deletedCount: number; mediaStorageNames: string[] } {
    const rows = this.database.prepare(`
      SELECT campaigns.id, media.storage_name
      FROM campaigns
      LEFT JOIN media ON media.id = campaigns.media_id
      WHERE campaigns.status IN ('completed', 'cancelled', 'failed')
        AND campaigns.finished_at IS NOT NULL
        AND campaigns.finished_at < datetime('now', ?)
    `).all(`-${retentionDays} days`) as unknown as Array<{ id: number; storage_name: string | null }>;

    if (rows.length === 0) return { deletedCount: 0, mediaStorageNames: [] };

    this.database.exec('BEGIN IMMEDIATE');
    try {
      const deleteCampaign = this.database.prepare('DELETE FROM campaigns WHERE id = ?');
      const deleteMedia = this.database.prepare('DELETE FROM media WHERE id IN (SELECT media_id FROM campaigns WHERE id = ?)');
      for (const row of rows) {
        deleteMedia.run(row.id);
        deleteCampaign.run(row.id);
      }
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
    return {
      deletedCount: rows.length,
      mediaStorageNames: rows.map((r) => r.storage_name).filter((name): name is string => Boolean(name)),
    };
  }
}

function baseQuery(where = ''): string {
  return `
    SELECT
      campaigns.id,
      campaigns.name,
      campaigns.contact_list_id,
      lists.name AS contact_list_name,
      campaigns.message_template,
      campaigns.delay_min_seconds,
      campaigns.delay_max_seconds,
      campaigns.status,
      campaigns.created_at,
      campaigns.updated_at
      , campaigns.prepared_at
      , campaigns.started_at
      , campaigns.finished_at
      , campaigns.source_campaign_id
      , campaigns.media_id
      , media.original_name AS media_original_name
      , media.mimetype AS media_mimetype
      , media.kind AS media_kind
      , media.size_bytes AS media_size_bytes
      , CASE WHEN campaigns.status = 'draft' THEN COUNT(members.id)
          ELSE (SELECT COUNT(*) FROM campaign_recipients recipients WHERE recipients.campaign_id = campaigns.id)
        END AS recipient_count
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
    ...(row.prepared_at === null ? {} : { preparedAt: row.prepared_at }),
    ...(row.started_at === null ? {} : { startedAt: row.started_at }),
    ...(row.finished_at === null ? {} : { finishedAt: row.finished_at }),
    ...(row.source_campaign_id === null ? {} : { sourceCampaignId: row.source_campaign_id }),
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
