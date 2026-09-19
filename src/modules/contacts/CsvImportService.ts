import { randomUUID } from 'node:crypto';
import chardet from 'chardet';
import { parse } from 'csv-parse/sync';
import iconv from 'iconv-lite';
import { normalizePhone } from './phone.js';
import { ContactService } from './ContactService.js';
import type { ContactListDetails, ManualContactInput } from './contactTypes.js';

const MAX_ROWS = 20_000;
const PREVIEW_ROWS = 20;
const SESSION_TTL_MS = 30 * 60 * 1_000;
const DELIMITERS = [',', ';', '\t', '|'] as const;

interface ImportSession {
  id: string;
  filename: string;
  encoding: string;
  delimiter: string;
  headers: string[];
  rows: string[][];
  expiresAt: number;
}

export interface ColumnCandidate {
  header: string;
  score: number;
}

export interface CsvPreview {
  previewId: string;
  filename: string;
  encoding: string;
  delimiter: string;
  headers: string[];
  rows: Record<string, string>[];
  rowCount: number;
  phoneCandidates: ColumnCandidate[];
  nameCandidates: ColumnCandidate[];
}

export interface CsvAnalysis {
  previewId: string;
  phoneColumn: string;
  nameColumn?: string;
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  sample: Array<{
    rowNumber: number;
    name: string;
    phone: string;
    normalizedPhone?: string;
    status: 'valid' | 'invalid' | 'duplicate';
    reason?: string;
  }>;
}

export class CsvImportService {
  private readonly sessions = new Map<string, ImportSession>();

  public constructor(private readonly contacts: ContactService) {}

  public createPreview(filename: string, buffer: Buffer): CsvPreview {
    this.clearExpired();
    if (buffer.length === 0) throw new Error('O arquivo CSV está vazio.');

    const detectedEncoding = chardet.detect(buffer) ?? 'UTF-8';
    const encoding = normalizeEncoding(detectedEncoding);
    const text = iconv.decode(buffer, encoding);
    const { delimiter, rows } = parseWithBestDelimiter(text);
    if (rows.length < 2) throw new Error('O CSV precisa ter cabeçalho e pelo menos uma linha.');
    if (rows.length - 1 > MAX_ROWS) {
      throw new Error(`O CSV excede o limite de ${MAX_ROWS} contatos.`);
    }

    const headers = uniqueHeaders(rows[0] ?? []);
    const dataRows = rows.slice(1).filter((row) => row.some((value) => value.trim()));
    const id = randomUUID();
    const session: ImportSession = {
      id,
      filename,
      encoding,
      delimiter,
      headers,
      rows: dataRows,
      expiresAt: Date.now() + SESSION_TTL_MS,
    };
    this.sessions.set(id, session);

    return {
      previewId: id,
      filename,
      encoding,
      delimiter: delimiter === '\t' ? 'TAB' : delimiter,
      headers,
      rows: dataRows.slice(0, PREVIEW_ROWS).map((row) => rowToRecord(headers, row)),
      rowCount: dataRows.length,
      phoneCandidates: rankPhoneColumns(headers, dataRows),
      nameCandidates: rankNameColumns(headers),
    };
  }

  public analyze(
    previewId: string,
    phoneColumn: string,
    nameColumn?: string,
  ): CsvAnalysis {
    const session = this.getSession(previewId);
    const phoneIndex = requireColumn(session.headers, phoneColumn, 'telefone');
    const nameIndex = nameColumn ? requireColumn(session.headers, nameColumn, 'nome') : undefined;
    const seen = new Set<string>();
    let valid = 0;
    let invalid = 0;
    let duplicates = 0;

    const sample = session.rows.map((row, index) => {
      const phone = row[phoneIndex]?.trim() ?? '';
      const name = nameIndex === undefined ? phone : (row[nameIndex]?.trim() || phone);
      try {
        const normalizedPhone = normalizePhone(phone);
        if (seen.has(normalizedPhone)) {
          duplicates += 1;
          return {
            rowNumber: index + 2,
            name,
            phone,
            normalizedPhone,
            status: 'duplicate' as const,
            reason: 'Telefone repetido no arquivo.',
          };
        }
        seen.add(normalizedPhone);
        valid += 1;
        return { rowNumber: index + 2, name, phone, normalizedPhone, status: 'valid' as const };
      } catch (error) {
        invalid += 1;
        return {
          rowNumber: index + 2,
          name,
          phone,
          status: 'invalid' as const,
          reason: error instanceof Error ? error.message : 'Telefone inválido.',
        };
      }
    }).slice(0, 100);

    return {
      previewId,
      phoneColumn,
      ...(nameColumn ? { nameColumn } : {}),
      total: session.rows.length,
      valid,
      invalid,
      duplicates,
      sample,
    };
  }

  public confirm(
    previewId: string,
    listName: string,
    phoneColumn: string,
    nameColumn?: string,
  ): ContactListDetails {
    const session = this.getSession(previewId);
    const analysis = this.analyze(previewId, phoneColumn, nameColumn);
    if (analysis.valid === 0) throw new Error('Nenhum telefone válido foi encontrado.');

    const validRows = analysis.sample.filter((row) => row.status === 'valid');
    if (session.rows.length > analysis.sample.length) {
      const phoneIndex = requireColumn(session.headers, phoneColumn, 'telefone');
      const nameIndex = nameColumn ? requireColumn(session.headers, nameColumn, 'nome') : undefined;
      const seen = new Set(validRows.map((row) => row.normalizedPhone));
      for (const row of session.rows.slice(analysis.sample.length)) {
        const phone = row[phoneIndex]?.trim() ?? '';
        try {
          const normalized = normalizePhone(phone);
          if (seen.has(normalized)) continue;
          seen.add(normalized);
          validRows.push({
            rowNumber: 0,
            phone,
            name: nameIndex === undefined ? phone : (row[nameIndex]?.trim() || phone),
            normalizedPhone: normalized,
            status: 'valid',
          });
        } catch {
          // Linhas inválidas já são contabilizadas na análise e não são persistidas.
        }
      }
    }

    const contacts: ManualContactInput[] = validRows.map((row) => ({
      name: row.name,
      phone: row.normalizedPhone ?? row.phone,
    }));
    const created = this.contacts.createImportedList({ name: listName, contacts });
    this.sessions.delete(previewId);
    return created;
  }

  private getSession(id: string): ImportSession {
    this.clearExpired();
    const session = this.sessions.get(id);
    if (!session) throw new Error('A prévia expirou. Envie o arquivo novamente.');
    return session;
  }

  private clearExpired(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(id);
    }
  }
}

function normalizeEncoding(encoding: string): string {
  const normalized = encoding.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normalized.includes('utf8') || normalized === 'ascii') return 'utf8';
  if (normalized.includes('1252')) return 'windows-1252';
  if (normalized.includes('88591') || normalized.includes('latin1')) return 'latin1';
  return iconv.encodingExists(encoding) ? encoding : 'utf8';
}

function parseWithBestDelimiter(text: string): { delimiter: string; rows: string[][] } {
  const attempts = DELIMITERS.map((delimiter) => {
    try {
      const rows = parse(text, {
        bom: true,
        delimiter,
        relax_column_count: true,
        skip_empty_lines: true,
        trim: true,
        to_line: MAX_ROWS + 2,
      }) as string[][];
      const width = rows[0]?.length ?? 0;
      const consistent = rows.slice(1, 21).filter((row) => row.length === width).length;
      return { delimiter, rows, score: width > 1 ? width * 10 + consistent : 0 };
    } catch {
      return { delimiter, rows: [] as string[][], score: -1 };
    }
  });
  attempts.sort((a, b) => b.score - a.score);
  const best = attempts[0];
  if (!best || best.score <= 0) throw new Error('Não foi possível identificar as colunas do CSV.');
  return { delimiter: best.delimiter, rows: best.rows };
}

function uniqueHeaders(rawHeaders: string[]): string[] {
  const counts = new Map<string, number>();
  return rawHeaders.map((raw, index) => {
    const base = raw.trim() || `Coluna ${index + 1}`;
    const count = (counts.get(base) ?? 0) + 1;
    counts.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });
}

function rowToRecord(headers: string[], row: string[]): Record<string, string> {
  return Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']));
}

function rankPhoneColumns(headers: string[], rows: string[][]): ColumnCandidate[] {
  const keywords = /phone|telefone|celular|mobile|whatsapp|fone|número|numero/i;
  return headers.map((header, index) => {
    const values = rows.slice(0, 100).map((row) => row[index] ?? '').filter(Boolean);
    const valid = values.filter((value) => {
      try { normalizePhone(value); return true; } catch { return false; }
    }).length;
    const ratio = values.length === 0 ? 0 : valid / values.length;
    return { header, score: Math.round((keywords.test(header) ? 50 : 0) + ratio * 50) };
  }).filter((candidate) => candidate.score > 0).sort((a, b) => b.score - a.score);
}

function rankNameColumns(headers: string[]): ColumnCandidate[] {
  const exact = /^(name|nome|full name|nome completo)$/i;
  const partial = /name|nome/i;
  return headers.map((header) => ({
    header,
    score: exact.test(header) ? 100 : partial.test(header) ? 70 : 0,
  })).filter((candidate) => candidate.score > 0).sort((a, b) => b.score - a.score);
}

function requireColumn(headers: string[], column: string, label: string): number {
  const index = headers.indexOf(column);
  if (index === -1) throw new Error(`A coluna de ${label} não existe na prévia.`);
  return index;
}
