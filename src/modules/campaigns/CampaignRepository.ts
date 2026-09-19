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
}

export class CampaignRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public createDraft(input: Required<CampaignComposerInput>): CampaignSummary {
    const result = this.database.prepare(`
      INSERT INTO campaigns (
        name, contact_list_id, message_template, delay_min_seconds, delay_max_seconds
      ) VALUES (?, ?, ?, ?, ?)
    `).run(
      input.name,
      input.contactListId,
      input.messageTemplate,
      input.delayMinSeconds,
      input.delayMaxSeconds,
    );
    const created = this.findById(Number(result.lastInsertRowid));
    if (!created) throw new Error('O rascunho criado não pôde ser recuperado.');
    return created;
  }

  public list(): CampaignSummary[] {
    return (this.database.prepare(`${baseQuery()} ORDER BY campaigns.id DESC`).all() as unknown as CampaignRow[])
      .map(toSummary);
  }

  public findById(id: number): CampaignSummary | undefined {
    const row = this.database.prepare(baseQuery('WHERE campaigns.id = ?')).get(id) as unknown as CampaignRow | undefined;
    return row ? toSummary(row) : undefined;
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
    FROM campaigns
    JOIN contact_lists lists ON lists.id = campaigns.contact_list_id
    LEFT JOIN contact_list_members members ON members.contact_list_id = lists.id
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
  };
}
