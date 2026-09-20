import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, sep } from 'node:path';
import {
  ALLOWED_ROOTS,
  assertSafeRelPath,
  assertSchemaCompatible,
  packBackup,
  unpackBackup,
  type BackupInputFile,
  type BackupManifest,
} from './backupArchive.js';

export interface BackupHooks {
  /** Preparação antes de ler os arquivos (ex.: parar worker, checkpoint WAL). */
  beforeCreate?: () => void | Promise<void>;
  /** Preparação antes de sobrescrever os dados (ex.: parar worker, fechar banco). */
  beforeRestore?: () => void | Promise<void>;
  /** Após restaurar (ou rollback): reabrir banco/serviços. */
  afterRestore?: () => void | Promise<void>;
}

export interface RestoreResult {
  manifest: BackupManifest;
  restoredFiles: number;
}

/**
 * Cria e restaura backups do diretório `data/` (subdiretórios database, media,
 * sessions). A restauração é atômica com rollback: os dados atuais são movidos
 * para uma pasta de segurança antes da troca e restaurados caso algo falhe.
 */
export class BackupService {
  public constructor(
    private readonly dataDir: string,
    private readonly appVersion: string,
    private readonly schemaVersion: number,
    private readonly hooks: BackupHooks = {},
  ) {}

  /** Gera o Buffer do backup. Chama `beforeCreate` (ex.: checkpoint WAL) antes de ler. */
  public async createBackup(): Promise<{ buffer: Buffer; filename: string }> {
    await this.hooks.beforeCreate?.();
    const files: BackupInputFile[] = [];
    for (const root of ALLOWED_ROOTS) {
      const rootDir = join(this.dataDir, root);
      if (!existsSync(rootDir)) continue;
      for (const absPath of walkFiles(rootDir)) {
        const relPath = toPosix(relative(this.dataDir, absPath));
        assertSafeRelPath(relPath);
        files.push({ relPath, content: readFileSync(absPath) });
      }
    }
    const buffer = packBackup(files, {
      appVersion: this.appVersion,
      schemaVersion: this.schemaVersion,
    });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return { buffer, filename: `wa-delivery-backup-${stamp}.wabkp` };
  }

  /**
   * Restaura um backup de forma atômica:
   * 1. valida assinatura, versão e checksums (unpackBackup + schema);
   * 2. `beforeRestore` (parar worker, fechar banco);
   * 3. extrai para um diretório temporário;
   * 4. move os dados atuais para uma pasta de segurança;
   * 5. troca os diretórios; em caso de falha, faz rollback;
   * 6. `afterRestore` (reabrir banco/serviços).
   */
  public async restoreBackup(buffer: Buffer): Promise<RestoreResult> {
    const { manifest, files } = unpackBackup(buffer);
    assertSchemaCompatible(manifest.schemaVersion, this.schemaVersion);

    const tempDir = `${this.dataDir}.restore-${Date.now()}`;
    const safetyDir = `${this.dataDir}.previous-${Date.now()}`;

    // 3) Extrai para o diretório temporário (caminhos já validados).
    try {
      mkdirSync(tempDir, { recursive: true });
      for (const file of files) {
        assertSafeRelPath(file.relPath);
        const dest = join(tempDir, ...file.relPath.split('/'));
        mkdirSync(join(dest, '..'), { recursive: true });
        writeFileSync(dest, file.content);
      }
    } catch (error) {
      rmSync(tempDir, { recursive: true, force: true });
      throw error;
    }

    await this.hooks.beforeRestore?.();

    // 4/5) Troca atômica com pasta de segurança e rollback em caso de falha.
    try {
      if (existsSync(this.dataDir)) renameSync(this.dataDir, safetyDir);
      renameSync(tempDir, this.dataDir);
    } catch (error) {
      // Rollback: tenta restaurar os dados anteriores.
      try {
        if (!existsSync(this.dataDir) && existsSync(safetyDir)) {
          renameSync(safetyDir, this.dataDir);
        }
      } catch {
        // Falha no rollback é reportada junto ao erro original.
      }
      rmSync(tempDir, { recursive: true, force: true });
      await this.hooks.afterRestore?.();
      throw error instanceof Error
        ? new Error(`Falha ao restaurar o backup: ${error.message}`)
        : error;
    }

    // Sucesso: remove a pasta de segurança e reabre serviços.
    rmSync(safetyDir, { recursive: true, force: true });
    await this.hooks.afterRestore?.();
    return { manifest, restoredFiles: files.length };
  }
}

/** Lista recursivamente todos os arquivos sob um diretório (caminhos absolutos). */
function walkFiles(dir: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walkFiles(abs));
    else if (entry.isFile()) result.push(abs);
  }
  return result;
}

function toPosix(p: string): string {
  return p.split(sep).join('/');
}

/** Utilitário exportado para conferência de integridade em testes/CLI. */
export function fileChecksum(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** Utilitário: copia um diretório recursivamente (para preparo de testes). */
export function copyDir(source: string, destination: string): void {
  if (!existsSync(source)) return;
  if (!statSync(source).isDirectory()) return;
  cpSync(source, destination, { recursive: true });
}
