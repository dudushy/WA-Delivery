import type { DatabaseSync } from 'node:sqlite';
import type { CampaignRecipientSnapshot, CampaignSummary } from '../campaigns/campaignTypes.js';
import type { QueueProgress } from './queueTypes.js';

interface QueueRecipient extends CampaignRecipientSnapshot {
  attemptCount: number;
}

export class CampaignQueueRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public recoverInterrupted(): number {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const error = 'Envio interrompido durante o encerramento.';
      const interrupted = Number(this.database.prepare(`
        UPDATE campaign_recipients SET status = 'failed', last_error = ?, updated_at = CURRENT_TIMESTAMP
        WHERE status = 'sending'
      `).run(error).changes);
      this.database.prepare(`
        UPDATE delivery_attempts SET outcome = 'failed', error_message = ?, finished_at = CURRENT_TIMESTAMP
        WHERE outcome = 'sending'
      `).run(error);
      this.database.prepare(
        "UPDATE campaigns SET status = 'paused', updated_at = CURRENT_TIMESTAMP WHERE status = 'running'",
      ).run();
      this.database.exec('COMMIT');
      return interrupted;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  public start(campaignId: number, allowedStatus: 'ready' | 'paused'): boolean {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const active = this.database.prepare(
        "SELECT id FROM campaigns WHERE status = 'running' AND id != ?",
      ).get(campaignId);
      if (active) {
        this.database.exec('ROLLBACK');
        return false;
      }
      const result = this.database.prepare(`
        UPDATE campaigns SET status = 'running', started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = ?
      `).run(campaignId, allowedStatus);
      this.database.exec('COMMIT');
      return result.changes > 0;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  public setStatus(campaignId: number, from: CampaignSummary['status'], to: CampaignSummary['status']): boolean {
    const finished = to === 'completed' || to === 'cancelled' || to === 'failed';
    return this.database.prepare(`
      UPDATE campaigns SET status = ?, updated_at = CURRENT_TIMESTAMP,
        finished_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE finished_at END
      WHERE id = ? AND status = ?
    `).run(to, finished ? 1 : 0, campaignId, from).changes > 0;
  }

  public skipPending(campaignId: number): void {
    this.database.prepare(`
      UPDATE campaign_recipients SET status = 'skipped', last_error = 'Campanha cancelada.',
        updated_at = CURRENT_TIMESTAMP WHERE campaign_id = ? AND status = 'pending'
    `).run(campaignId);
  }

  public findNext(campaignId: number): QueueRecipient | undefined {
    const row = this.database.prepare(`
      SELECT id, campaign_id, source_contact_id, name, phone, rendered_message, status, attempt_count
      FROM campaign_recipients WHERE campaign_id = ? AND status = 'pending' ORDER BY id LIMIT 1
    `).get(campaignId) as {
      id: number; campaign_id: number; source_contact_id: number; name: string; phone: string;
      rendered_message: string; status: QueueRecipient['status']; attempt_count: number;
    } | undefined;
    return row ? {
      id: row.id, campaignId: row.campaign_id, sourceContactId: row.source_contact_id,
      name: row.name, phone: row.phone, renderedMessage: row.rendered_message,
      status: row.status, attemptCount: row.attempt_count,
    } : undefined;
  }

  public markSending(recipient: QueueRecipient): number {
    const attemptNumber = recipient.attemptCount + 1;
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database.prepare(`
        UPDATE campaign_recipients SET status = 'sending', attempt_count = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'pending'
      `).run(attemptNumber, recipient.id);
      const result = this.database.prepare(`
        INSERT INTO delivery_attempts (campaign_id, recipient_id, attempt_number, outcome)
        VALUES (?, ?, ?, 'sending')
      `).run(recipient.campaignId, recipient.id, attemptNumber);
      this.database.exec('COMMIT');
      return Number(result.lastInsertRowid);
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  public finishAttempt(attemptId: number, recipientId: number, outcome: 'sent' | 'failed' | 'skipped', details?: { messageId?: string; error?: string }): void {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database.prepare(`
        UPDATE campaign_recipients SET status = ?, message_id = ?, sent_at = CASE WHEN ? = 'sent' THEN CURRENT_TIMESTAMP ELSE NULL END,
          last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(outcome, details?.messageId ?? null, outcome, details?.error ?? null, recipientId);
      this.database.prepare(`
        UPDATE delivery_attempts SET outcome = ?, message_id = ?, error_message = ?, finished_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(outcome, details?.messageId ?? null, details?.error ?? null, attemptId);
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  public progress(campaignId: number): QueueProgress | undefined {
    const row = this.database.prepare(`
      SELECT campaigns.status, COUNT(recipients.id) AS total,
        SUM(CASE WHEN recipients.status IN ('pending', 'sending') THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN recipients.status = 'sent' THEN 1 ELSE 0 END) AS sent,
        SUM(CASE WHEN recipients.status = 'failed' THEN 1 ELSE 0 END) AS failed,
        SUM(CASE WHEN recipients.status = 'skipped' THEN 1 ELSE 0 END) AS skipped
      FROM campaigns LEFT JOIN campaign_recipients recipients ON recipients.campaign_id = campaigns.id
      WHERE campaigns.id = ? GROUP BY campaigns.id
    `).get(campaignId) as { status: QueueProgress['status']; total: number; pending: number; sent: number; failed: number; skipped: number } | undefined;
    return row ? { campaignId, ...row } : undefined;
  }
}
