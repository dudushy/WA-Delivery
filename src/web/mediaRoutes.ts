import type { FastifyInstance, FastifyReply } from 'fastify';
import type { MediaService } from '../modules/media/MediaService.js';
import { MediaValidationError } from '../modules/media/mediaTypes.js';
import type { StoredMedia } from '../modules/media/mediaTypes.js';

export function registerMediaRoutes(server: FastifyInstance, media: MediaService): void {
  server.post('/api/media', async (request, reply) => {
    try {
      const file = await request.file();
      if (!file) return reply.code(400).send({ message: 'Selecione uma imagem ou vídeo.' });
      const stored = await media.upload(file.filename, file.mimetype, await file.toBuffer());
      return reply.code(201).send(toDto(stored));
    } catch (error) {
      if (error instanceof MediaValidationError) {
        return reply.code(422).send({ message: error.message });
      }
      const message = error instanceof Error ? error.message : 'Falha ao salvar a mídia.';
      return reply.code(400).send({ message });
    }
  });

  server.get<{ Params: { id: string } }>('/api/media/:id', async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return invalidId(reply);
    const stored = media.findById(id);
    if (!stored) return reply.code(404).send({ message: 'Mídia não encontrada.' });
    return reply.type(stored.mimetype).send(media.open(stored));
  });
}

function toDto(media: StoredMedia) {
  return {
    id: media.id,
    originalName: media.originalName,
    mimetype: media.mimetype,
    kind: media.kind,
    sizeBytes: media.sizeBytes,
    previewUrl: `/api/media/${media.id}`,
  };
}

function invalidId(reply: FastifyReply): FastifyReply {
  return reply.code(400).send({ message: 'Identificador da mídia inválido.' });
}
