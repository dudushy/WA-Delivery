import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  packBackup,
  unpackBackup,
  assertSafeRelPath,
  assertSchemaCompatible,
  BACKUP_MAGIC,
} from '../src/modules/backup/backupArchive.ts';
import { BackupService } from '../src/modules/backup/BackupService.ts';

describe('backupArchive', () => {
  it('empacota e desempacota preservando conteúdo e checksums', () => {
    const files = [
      { relPath: 'database/wa-delivery.db', content: Buffer.from('conteudo do banco') },
      { relPath: 'media/foto.jpg', content: Buffer.from([0xff, 0xd8, 0xff, 0x00]) },
      { relPath: 'sessions/baileys/creds.json', content: Buffer.from('{"x":1}') },
    ];
    const buffer = packBackup(files, { appVersion: '2.0.0', schemaVersion: 9 });
    assert.ok(buffer.subarray(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC));

    const { manifest, files: out } = unpackBackup(buffer);
    assert.equal(manifest.appVersion, '2.0.0');
    assert.equal(manifest.schemaVersion, 9);
    assert.equal(out.length, 3);
    assert.equal(out[0]?.content.toString(), 'conteudo do banco');
    assert.equal(out[1]?.relPath, 'media/foto.jpg');
  });

  it('rejeita caminhos com path traversal, absolutos ou fora dos roots', () => {
    assert.throws(() => assertSafeRelPath('../etc/passwd'), /traversal/);
    assert.throws(() => assertSafeRelPath('/etc/passwd'), /absoluto/);
    assert.throws(() => assertSafeRelPath('C:\\Windows\\x'), /absoluto/);
    assert.throws(() => assertSafeRelPath('outra/pasta/x'), /permitidos/);
    assert.doesNotThrow(() => assertSafeRelPath('database/wa-delivery.db'));
  });

  it('rejeita backup com assinatura inválida', () => {
    assert.throws(
      () => unpackBackup(Buffer.from('não é um backup válido aqui')),
      /assinatura|inválido/i,
    );
  });

  it('detecta corrupção por checksum', () => {
    const files = [{ relPath: 'database/x.db', content: Buffer.from('abc') }];
    const buffer = packBackup(files, { appVersion: '2.0.0', schemaVersion: 9 });
    // Corrompe o último byte (parte do payload).
    const corrupted = Buffer.from(buffer);
    corrupted[corrupted.length - 1] ^= 0xff;
    assert.throws(() => unpackBackup(corrupted), /[Cc]hecksum|corrompid/);
  });

  it('recusa restaurar backup com schema mais novo', () => {
    assert.throws(() => assertSchemaCompatible(99, 9), /mais nova|schema/);
    assert.doesNotThrow(() => assertSchemaCompatible(9, 9));
    assert.doesNotThrow(() => assertSchemaCompatible(5, 9));
  });
});

async function makeDataDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'wa-backup-'));
  await mkdir(join(dir, 'data', 'database'), { recursive: true });
  await mkdir(join(dir, 'data', 'media'), { recursive: true });
  await mkdir(join(dir, 'data', 'sessions', 'baileys'), { recursive: true });
  await writeFile(join(dir, 'data', 'database', 'wa-delivery.db'), 'BANCO-ORIGINAL');
  await writeFile(join(dir, 'data', 'media', 'foto.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0x00]));
  await writeFile(join(dir, 'data', 'sessions', 'baileys', 'creds.json'), '{"session":"x"}');
  return dir;
}

describe('BackupService', () => {
  it('cria um backup com o conteúdo esperado', async () => {
    const root = await makeDataDir();
    try {
      const service = new BackupService(join(root, 'data'), '2.0.0', 9);
      const { buffer, filename } = await service.createBackup();
      assert.match(filename, /wa-delivery-backup-.*\.wabkp$/);
      const { manifest } = unpackBackup(buffer);
      const paths = manifest.files.map((f) => f.relPath).sort();
      assert.deepEqual(paths, [
        'database/wa-delivery.db',
        'media/foto.jpg',
        'sessions/baileys/creds.json',
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('restaura um backup sobrescrevendo os dados atuais', async () => {
    const root = await makeDataDir();
    try {
      const service = new BackupService(join(root, 'data'), '2.0.0', 9);
      const { buffer } = await service.createBackup();

      // Altera os dados atuais após o backup.
      await writeFile(join(root, 'data', 'database', 'wa-delivery.db'), 'BANCO-ALTERADO');

      const result = await service.restoreBackup(buffer);
      assert.equal(result.restoredFiles, 3);
      const restored = await readFile(join(root, 'data', 'database', 'wa-delivery.db'), 'utf8');
      assert.equal(restored, 'BANCO-ORIGINAL');
      // A pasta de segurança temporária não deve permanecer.
      assert.equal(existsSync(`${join(root, 'data')}.previous-`), false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('recusa restaurar um backup de schema incompatível e preserva os dados', async () => {
    const root = await makeDataDir();
    try {
      const service = new BackupService(join(root, 'data'), '2.0.0', 9);
      // Backup gerado por schema 99 (mais novo).
      const buffer = packBackup(
        [{ relPath: 'database/wa-delivery.db', content: Buffer.from('NOVO') }],
        { appVersion: '9.0.0', schemaVersion: 99 },
      );
      await assert.rejects(() => service.restoreBackup(buffer), /mais nova|schema/);
      // Dados atuais intactos.
      const current = await readFile(join(root, 'data', 'database', 'wa-delivery.db'), 'utf8');
      assert.equal(current, 'BANCO-ORIGINAL');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('recusa restaurar um arquivo arbitrário (assinatura inválida)', async () => {
    const root = await makeDataDir();
    try {
      const service = new BackupService(join(root, 'data'), '2.0.0', 9);
      await assert.rejects(
        () => service.restoreBackup(Buffer.from('arquivo qualquer, não é backup')),
        /assinatura|inválido/i,
      );
      const current = await readFile(join(root, 'data', 'database', 'wa-delivery.db'), 'utf8');
      assert.equal(current, 'BANCO-ORIGINAL');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('executa os hooks beforeRestore/afterRestore na restauração', async () => {
    const root = await makeDataDir();
    try {
      const order: string[] = [];
      const service = new BackupService(join(root, 'data'), '2.0.0', 9, {
        beforeRestore: () => {
          order.push('before');
        },
        afterRestore: () => {
          order.push('after');
        },
      });
      const { buffer } = await service.createBackup();
      await service.restoreBackup(buffer);
      assert.deepEqual(order, ['before', 'after']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
