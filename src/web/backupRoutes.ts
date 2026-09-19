import type { FastifyInstance } from 'fastify';
import type { BackupService } from '../modules/backup/BackupService.js';

const MAX_BACKUP_BYTES = 512 * 1024 * 1024;

export interface BackupRouteOptions {
  /** Ação a executar após uma restauração bem-sucedida (ex.: encerrar para reiniciar). */
  onRestored?: () => void;
}

export function registerBackupRoutes(
  server: FastifyInstance,
  backup: BackupService,
  options: BackupRouteOptions = {},
): void {
  // Download do backup. O conteúdo é binário e nunca é logado.
  server.get('/api/backup', async (_request, reply) => {
    const { buffer, filename } = await backup.createBackup();
    reply.header('Content-Type', 'application/octet-stream');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    return reply.send(buffer);
  });

  // Restauração via upload multipart de um único arquivo .wabkp.
  server.post('/api/backup/restore', async (request, reply) => {
    const file = await request.file({ limits: { fileSize: MAX_BACKUP_BYTES, files: 1 } });
    if (!file) {
      return reply.code(400).send({ message: 'Envie o arquivo de backup (.wabkp).' });
    }
    const chunks: Buffer[] = [];
    for await (const chunk of file.file) chunks.push(chunk as Buffer);
    if (file.file.truncated) {
      return reply.code(413).send({ message: 'O arquivo de backup excede o tamanho máximo permitido.' });
    }
    const buffer = Buffer.concat(chunks);

    try {
      const result = await backup.restoreBackup(buffer);
      // Restauração exige reinício para recarregar o banco com segurança.
      if (options.onRestored) setTimeout(() => options.onRestored?.(), 250);
      return {
        restoredFiles: result.restoredFiles,
        createdAt: result.manifest.createdAt,
        appVersion: result.manifest.appVersion,
        schemaVersion: result.manifest.schemaVersion,
        message: 'Backup restaurado. A aplicação será reiniciada; abra novamente após alguns segundos.',
      };
    } catch (error) {
      // Não expõe stack trace; mensagem de erro é segura (sem dados sensíveis).
      const message = error instanceof Error ? error.message : 'Falha ao restaurar o backup.';
      return reply.code(422).send({ message });
    }
  });
}
