import type { DatabaseSync } from 'node:sqlite';
import type {
  ContactListDetails,
  ContactListMember,
  ContactListSummary,
} from './contactTypes.js';

interface PreparedManualContact {
  name: string;
  normalizedPhone: string;
}

interface SummaryRow {
  id: number;
  name: string;
  source: 'manual' | 'csv';
  contact_count: number;
  created_at: string;
}

export class ContactRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public createManualList(name: string, contacts: PreparedManualContact[]): ContactListDetails {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const listResult = this.database
        .prepare("INSERT INTO contact_lists (name, source) VALUES (?, 'manual')")
        .run(name);
      const listId = Number(listResult.lastInsertRowid);

      const findContact = this.database.prepare(
        'SELECT id FROM contacts WHERE normalized_phone = ?',
      );
      const insertContact = this.database.prepare(
        'INSERT INTO contacts (normalized_phone) VALUES (?)',
      );
      const insertMember = this.database.prepare(`
        INSERT INTO contact_list_members (contact_list_id, contact_id, name)
        VALUES (?, ?, ?)
      `);

      for (const contact of contacts) {
        const existing = findContact.get(contact.normalizedPhone) as { id: number } | undefined;
        const contactId = existing?.id
          ?? Number(insertContact.run(contact.normalizedPhone).lastInsertRowid);
        insertMember.run(listId, contactId, contact.name);
      }

      this.database.exec('COMMIT');
      const created = this.findById(listId);
      if (!created) throw new Error('A lista criada não pôde ser recuperada.');
      return created;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  public list(): ContactListSummary[] {
    const rows = this.database.prepare(`
      SELECT
        lists.id,
        lists.name,
        lists.source,
        lists.created_at,
        COUNT(members.id) AS contact_count
      FROM contact_lists lists
      LEFT JOIN contact_list_members members ON members.contact_list_id = lists.id
      GROUP BY lists.id
      ORDER BY lists.id DESC
    `).all() as unknown as SummaryRow[];

    return rows.map(toSummary);
  }

  public findById(id: number): ContactListDetails | undefined {
    const row = this.database.prepare(`
      SELECT
        lists.id,
        lists.name,
        lists.source,
        lists.created_at,
        COUNT(members.id) AS contact_count
      FROM contact_lists lists
      LEFT JOIN contact_list_members members ON members.contact_list_id = lists.id
      WHERE lists.id = ?
      GROUP BY lists.id
    `).get(id) as unknown as SummaryRow | undefined;

    if (!row) return undefined;

    const members = this.database.prepare(`
      SELECT members.id, members.name, contacts.normalized_phone AS phone
      FROM contact_list_members members
      JOIN contacts ON contacts.id = members.contact_id
      WHERE members.contact_list_id = ?
      ORDER BY members.id
    `).all(id) as unknown as ContactListMember[];

    return { ...toSummary(row), contacts: members };
  }
}

function toSummary(row: SummaryRow): ContactListSummary {
  return {
    id: row.id,
    name: row.name,
    source: row.source,
    contactCount: row.contact_count,
    createdAt: row.created_at,
  };
}
