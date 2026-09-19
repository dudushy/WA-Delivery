import type { DatabaseSync } from 'node:sqlite';
import type {
  ContactListDetails,
  ContactListSummary,
} from './contactTypes.js';

export interface PreparedContact {
  name: string;
  normalizedPhone: string;
  /** Colunas extras importadas (ex.: cidade, empresa), usadas em variáveis de template. */
  data?: Record<string, string>;
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

  public createList(
    name: string,
    source: 'manual' | 'csv',
    contacts: PreparedContact[],
  ): ContactListDetails {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const listResult = this.database
        .prepare('INSERT INTO contact_lists (name, source) VALUES (?, ?)')
        .run(name, source);
      const listId = Number(listResult.lastInsertRowid);

      const findContact = this.database.prepare(
        'SELECT id FROM contacts WHERE normalized_phone = ?',
      );
      const insertContact = this.database.prepare(
        'INSERT INTO contacts (normalized_phone) VALUES (?)',
      );
      const insertMember = this.database.prepare(`
        INSERT INTO contact_list_members (contact_list_id, contact_id, name, source_data_json)
        VALUES (?, ?, ?, ?)
      `);

      for (const contact of contacts) {
        const existing = findContact.get(contact.normalizedPhone) as { id: number } | undefined;
        const contactId = existing?.id
          ?? Number(insertContact.run(contact.normalizedPhone).lastInsertRowid);
        insertMember.run(listId, contactId, contact.name, serializeData(contact.data));
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
      SELECT members.id, members.name, contacts.normalized_phone AS phone,
        contacts.opted_out AS opted_out, members.source_data_json AS source_data_json
      FROM contact_list_members members
      JOIN contacts ON contacts.id = members.contact_id
      WHERE members.contact_list_id = ?
      ORDER BY members.id
    `).all(id) as unknown as Array<{
      id: number;
      name: string;
      phone: string;
      opted_out: number;
      source_data_json: string;
    }>;

    return {
      ...toSummary(row),
      contacts: members.map((member) => ({
        id: member.id,
        name: member.name,
        phone: member.phone,
        optedOut: member.opted_out === 1,
        data: parseData(member.source_data_json),
      })),
    };
  }

  public renameList(id: number, name: string): ContactListDetails | undefined {
    const result = this.database
      .prepare('UPDATE contact_lists SET name = ? WHERE id = ?')
      .run(name, id);
    return result.changes === 0 ? undefined : this.findById(id);
  }

  public deleteList(id: number): boolean {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const result = this.database.prepare('DELETE FROM contact_lists WHERE id = ?').run(id);
      this.deleteOrphanContacts();
      this.database.exec('COMMIT');
      return result.changes > 0;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  public addMember(
    listId: number,
    contact: PreparedContact,
  ): ContactListDetails | undefined {
    if (!this.findById(listId)) return undefined;
    const contactId = this.findOrCreateContact(contact.normalizedPhone);
    const duplicate = this.database.prepare(`
      SELECT 1 FROM contact_list_members
      WHERE contact_list_id = ? AND contact_id = ?
    `).get(listId, contactId);
    if (duplicate) throw new Error('Este telefone já existe na lista.');

    this.database.prepare(`
      INSERT INTO contact_list_members (contact_list_id, contact_id, name, source_data_json)
      VALUES (?, ?, ?, ?)
    `).run(listId, contactId, contact.name, serializeData(contact.data));
    return this.findById(listId);
  }

  public updateMember(
    listId: number,
    memberId: number,
    contact: PreparedContact,
  ): ContactListDetails | undefined {
    const current = this.database.prepare(`
      SELECT contact_id FROM contact_list_members
      WHERE id = ? AND contact_list_id = ?
    `).get(memberId, listId) as { contact_id: number } | undefined;
    if (!current) return undefined;

    this.database.exec('BEGIN IMMEDIATE');
    try {
      const contactId = this.findOrCreateContact(contact.normalizedPhone);
      const duplicate = this.database.prepare(`
        SELECT 1 FROM contact_list_members
        WHERE contact_list_id = ? AND contact_id = ? AND id != ?
      `).get(listId, contactId, memberId);
      if (duplicate) throw new Error('Este telefone já existe na lista.');

      this.database.prepare(`
        UPDATE contact_list_members SET name = ?, contact_id = ?
        WHERE id = ? AND contact_list_id = ?
      `).run(contact.name, contactId, memberId, listId);
      this.deleteOrphanContacts();
      this.database.exec('COMMIT');
      return this.findById(listId);
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  public deleteMember(listId: number, memberId: number): ContactListDetails | undefined {
    if (!this.findById(listId)) return undefined;
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const result = this.database.prepare(`
        DELETE FROM contact_list_members WHERE id = ? AND contact_list_id = ?
      `).run(memberId, listId);
      if (result.changes === 0) {
        this.database.exec('ROLLBACK');
        return undefined;
      }
      this.deleteOrphanContacts();
      this.database.exec('COMMIT');
      return this.findById(listId);
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  /**
   * Define o opt-out de um contato (por telefone, global a todas as listas)
   * a partir de um membro específico. Retorna a lista atualizada.
   */
  public setOptOutByMember(
    listId: number,
    memberId: number,
    optedOut: boolean,
  ): ContactListDetails | undefined {
    const member = this.database.prepare(`
      SELECT contact_id FROM contact_list_members WHERE id = ? AND contact_list_id = ?
    `).get(memberId, listId) as { contact_id: number } | undefined;
    if (!member) return undefined;
    this.database
      .prepare('UPDATE contacts SET opted_out = ? WHERE id = ?')
      .run(optedOut ? 1 : 0, member.contact_id);
    return this.findById(listId);
  }

  /** Retorna o conjunto de telefones (normalizados) marcados como opt-out. */
  public listOptedOutPhones(): Set<string> {
    const rows = this.database
      .prepare('SELECT normalized_phone FROM contacts WHERE opted_out = 1')
      .all() as unknown as Array<{ normalized_phone: string }>;
    return new Set(rows.map((row) => row.normalized_phone));
  }

  private findOrCreateContact(normalizedPhone: string): number {
    const existing = this.database
      .prepare('SELECT id FROM contacts WHERE normalized_phone = ?')
      .get(normalizedPhone) as { id: number } | undefined;
    return existing?.id
      ?? Number(
        this.database
          .prepare('INSERT INTO contacts (normalized_phone) VALUES (?)')
          .run(normalizedPhone).lastInsertRowid,
      );
  }

  private deleteOrphanContacts(): void {
    this.database.exec(`
      DELETE FROM contacts
      WHERE NOT EXISTS (
        SELECT 1 FROM contact_list_members members WHERE members.contact_id = contacts.id
      )
    `);
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

/** Serializa as colunas extras como JSON (objeto vazio quando ausentes). */
function serializeData(data?: Record<string, string>): string {
  if (!data || Object.keys(data).length === 0) return '{}';
  return JSON.stringify(data);
}

/** Reidrata as colunas extras a partir do JSON persistido, de forma tolerante. */
function parseData(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const result: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed)) {
        result[key] = typeof value === 'string' ? value : String(value ?? '');
      }
      return result;
    }
  } catch {
    // JSON inválido é tratado como ausência de dados extras.
  }
  return {};
}
