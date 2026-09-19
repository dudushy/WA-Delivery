import { createHash } from 'node:crypto';

/**
 * Formato de arquivo de backup do WA-Delivery (single file, sem dependências):
 *
 *   MAGIC (8 bytes ASCII "WABKP01\n")
 *   manifestLength (UInt32BE)
 *   manifest (JSON UTF-8)
 *   payload (bytes dos arquivos, concatenados na ordem do manifest)
 *
 * O manifest carrega metadados de versão e, por arquivo, o caminho relativo,
 * tamanho e SHA-256, permitindo validar integridade e compatibilidade antes de
 * restaurar. Todos os caminhos são relativos e validados contra path traversal.
 */

export const BACKUP_MAGIC = Buffer.from('WABKP01\n', 'ascii');
export const BACKUP_FORMAT = 1;

/** Subdiretórios de `data/` permitidos no backup. */
export const ALLOWED_ROOTS = ['database', 'media', 'sessions'] as const;
export type BackupRoot = (typeof ALLOWED_ROOTS)[number];

export interface BackupFileEntry {
  /** Caminho relativo com separador "/", sempre iniciando por um root permitido. */
  relPath: string;
  size: number;
  sha256: string;
}

export interface BackupManifest {
  format: number;
  appVersion: string;
  schemaVersion: number;
  createdAt: string;
  files: BackupFileEntry[];
}

export interface BackupInputFile {
  relPath: string;
  content: Buffer;
}

export function sha256(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Valida um caminho relativo do backup: sem absolutos, sem `..`, sem drive do
 * Windows, e iniciando por um root permitido. Lança em caso de violação.
 */
export function assertSafeRelPath(relPath: string): void {
  const normalized = String(relPath ?? '').replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    throw new Error(`Caminho de backup inválido (absoluto): ${relPath}`);
  }
  const segments = normalized.split('/');
  if (segments.some((segment) => segment === '..' || segment === '.')) {
    throw new Error(`Caminho de backup inválido (traversal): ${relPath}`);
  }
  const root = segments[0];
  if (!ALLOWED_ROOTS.includes(root as BackupRoot)) {
    throw new Error(`Caminho de backup fora dos diretórios permitidos: ${relPath}`);
  }
}

/** Empacota arquivos em um único Buffer de backup com manifest e checksums. */
export function packBackup(
  files: BackupInputFile[],
  meta: { appVersion: string; schemaVersion: number; createdAt?: string },
): Buffer {
  for (const file of files) assertSafeRelPath(file.relPath);

  const entries: BackupFileEntry[] = files.map((file) => ({
    relPath: file.relPath.replace(/\\/g, '/'),
    size: file.content.length,
    sha256: sha256(file.content),
  }));

  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    appVersion: meta.appVersion,
    schemaVersion: meta.schemaVersion,
    createdAt: meta.createdAt ?? new Date().toISOString(),
    files: entries,
  };

  const manifestBuffer = Buffer.from(JSON.stringify(manifest), 'utf8');
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(manifestBuffer.length, 0);

  return Buffer.concat([BACKUP_MAGIC, lengthBuffer, manifestBuffer, ...files.map((f) => f.content)]);
}

/**
 * Lê e valida um Buffer de backup, retornando o manifest e os arquivos já
 * verificados (checksum e caminho seguro). Lança em qualquer inconsistência.
 */
export function unpackBackup(buffer: Buffer): { manifest: BackupManifest; files: BackupInputFile[] } {
  if (buffer.length < BACKUP_MAGIC.length + 4) {
    throw new Error('Arquivo de backup inválido ou truncado.');
  }
  if (!buffer.subarray(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC)) {
    throw new Error('Arquivo de backup não reconhecido (assinatura inválida).');
  }
  let offset = BACKUP_MAGIC.length;
  const manifestLength = buffer.readUInt32BE(offset);
  offset += 4;
  if (offset + manifestLength > buffer.length) {
    throw new Error('Arquivo de backup corrompido (manifest além do tamanho).');
  }

  let manifest: BackupManifest;
  try {
    manifest = JSON.parse(buffer.subarray(offset, offset + manifestLength).toString('utf8'));
  } catch {
    throw new Error('Manifest do backup inválido.');
  }
  offset += manifestLength;

  if (manifest.format !== BACKUP_FORMAT) {
    throw new Error(`Formato de backup incompatível (esperado ${BACKUP_FORMAT}, obtido ${manifest.format}).`);
  }
  if (!Array.isArray(manifest.files)) {
    throw new Error('Manifest do backup sem lista de arquivos.');
  }

  const files: BackupInputFile[] = [];
  for (const entry of manifest.files) {
    assertSafeRelPath(entry.relPath);
    if (!Number.isInteger(entry.size) || entry.size < 0 || offset + entry.size > buffer.length) {
      throw new Error(`Entrada de backup corrompida: ${entry.relPath}`);
    }
    const content = buffer.subarray(offset, offset + entry.size);
    offset += entry.size;
    if (sha256(content) !== entry.sha256) {
      throw new Error(`Checksum inválido para ${entry.relPath}. O backup pode estar corrompido.`);
    }
    files.push({ relPath: entry.relPath, content: Buffer.from(content) });
  }

  if (offset !== buffer.length) {
    throw new Error('Arquivo de backup contém dados extras não declarados no manifest.');
  }

  return { manifest, files };
}

/**
 * Verifica a compatibilidade de schema entre o backup e a aplicação atual.
 * Regra conservadora: não restaurar um backup com schema mais novo que o
 * suportado pela aplicação (poderia conter estruturas desconhecidas).
 */
export function assertSchemaCompatible(backupSchema: number, currentSchema: number): void {
  if (!Number.isInteger(backupSchema) || backupSchema <= 0) {
    throw new Error('Versão de schema do backup ausente ou inválida.');
  }
  if (backupSchema > currentSchema) {
    throw new Error(
      `Backup criado por uma versão mais nova (schema ${backupSchema} > ${currentSchema}). Atualize a aplicação antes de restaurar.`,
    );
  }
}
