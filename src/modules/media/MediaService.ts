import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MediaRepository } from './MediaRepository.js';
import { MediaValidationError, type MediaKind, type StoredMedia } from './mediaTypes.js';

const IMAGE_LIMIT = 10 * 1024 * 1024;
const VIDEO_LIMIT = 64 * 1024 * 1024;
const TEMPORARY_TTL_MS = 24 * 60 * 60 * 1_000;

const supportedTypes: Record<string, { kind: MediaKind; extension: string; limit: number }> = {
  'image/jpeg': { kind: 'image', extension: '.jpg', limit: IMAGE_LIMIT },
  'image/png': { kind: 'image', extension: '.png', limit: IMAGE_LIMIT },
  'image/webp': { kind: 'image', extension: '.webp', limit: IMAGE_LIMIT },
  'video/mp4': { kind: 'video', extension: '.mp4', limit: VIDEO_LIMIT },
};

export class MediaService {
  public constructor(
    private readonly repository: MediaRepository,
    private readonly directory: string,
  ) {}

  public async upload(originalName: string, mimetype: string, buffer: Buffer): Promise<StoredMedia> {
    const definition = supportedTypes[mimetype];
    if (!definition) {
      throw new MediaValidationError('Formato não suportado. Use JPG, PNG, WEBP ou MP4.');
    }
    if (buffer.length === 0) throw new MediaValidationError('O arquivo de mídia está vazio.');
    if (buffer.length > definition.limit) {
      const limitMb = definition.limit / 1024 / 1024;
      throw new MediaValidationError(`O arquivo excede o limite de ${limitMb} MB.`);
    }
    if (!matchesSignature(mimetype, buffer)) {
      throw new MediaValidationError('O conteúdo do arquivo não corresponde ao formato informado.');
    }

    await mkdir(this.directory, { recursive: true });
    const storageName = `${randomUUID()}${definition.extension}`;
    const path = join(this.directory, storageName);
    await writeFile(path, buffer, { flag: 'wx' });
    try {
      return this.repository.create({
        originalName: originalName.slice(0, 255),
        storageName,
        mimetype,
        kind: definition.kind,
        sizeBytes: buffer.length,
      });
    } catch (error) {
      await unlink(path).catch(() => undefined);
      throw error;
    }
  }

  public findById(id: number): StoredMedia | undefined {
    return this.repository.findById(id);
  }

  public open(media: StoredMedia) {
    return createReadStream(join(this.directory, media.storageName));
  }

  public resolvePath(media: StoredMedia): string {
    return join(this.directory, media.storageName);
  }

  public async removeFile(storageName: string): Promise<void> {
    await unlink(join(this.directory, storageName)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }

  public async cleanupExpiredTemporary(): Promise<number> {
    const cutoff = new Date(Date.now() - TEMPORARY_TTL_MS)
      .toISOString()
      .replace('T', ' ')
      .slice(0, 19);
    const expired = this.repository.findExpiredTemporary(cutoff);
    for (const media of expired) {
      this.repository.delete(media.id);
      await this.removeFile(media.storageName);
    }
    return expired.length;
  }
}

function matchesSignature(mimetype: string, buffer: Buffer): boolean {
  if (mimetype === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimetype === 'image/png') {
    return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mimetype === 'image/webp') {
    return buffer.subarray(0, 4).toString('ascii') === 'RIFF'
      && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  if (mimetype === 'video/mp4') {
    return buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp';
  }
  return false;
}
