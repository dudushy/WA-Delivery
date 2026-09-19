import type { FastifyInstance, FastifyReply } from 'fastify';
import type { CsvImportService } from '../modules/contacts/CsvImportService.js';

interface MappingBody {
  previewId?: string;
  phoneColumn?: string;
  nameColumn?: string;
}

interface ConfirmBody extends MappingBody {
  listName?: string;
}

export function registerCsvImportRoutes(server: FastifyInstance, imports: CsvImportService): void {
  server.post('/api/contact-imports/preview', async (request, reply) => {
    try {
      const file = await request.file();
      if (!file) return reply.code(400).send({ message: 'Selecione um arquivo CSV.' });
      if (!file.filename.toLowerCase().endsWith('.csv')) {
        return reply.code(415).send({ message: 'O arquivo precisa ter a extensão .csv.' });
      }
      return imports.createPreview(file.filename, await file.toBuffer());
    } catch (error) {
      return sendImportError(reply, error);
    }
  });

  server.post<{ Body: MappingBody }>('/api/contact-imports/analyze', async (request, reply) => {
    const { previewId, phoneColumn, nameColumn } = request.body ?? {};
    if (!previewId || !phoneColumn) {
      return reply.code(400).send({ message: 'Informe a prévia e a coluna de telefone.' });
    }
    try {
      return imports.analyze(previewId, phoneColumn, nameColumn || undefined);
    } catch (error) {
      return sendImportError(reply, error);
    }
  });

  server.post<{ Body: ConfirmBody }>('/api/contact-imports/confirm', async (request, reply) => {
    const { previewId, listName, phoneColumn, nameColumn } = request.body ?? {};
    if (!previewId || !listName || !phoneColumn) {
      return reply.code(400).send({
        message: 'Informe o nome da lista, a prévia e a coluna de telefone.',
      });
    }
    try {
      return reply
        .code(201)
        .send(imports.confirm(previewId, listName, phoneColumn, nameColumn || undefined));
    } catch (error) {
      return sendImportError(reply, error);
    }
  });
}

function sendImportError(reply: FastifyReply, error: unknown): FastifyReply {
  const message = error instanceof Error ? error.message : 'Falha ao processar o CSV.';
  return reply.code(400).send({ message });
}
