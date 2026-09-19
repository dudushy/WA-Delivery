export type MediaKind = 'image' | 'video';

export interface StoredMedia {
  id: number;
  originalName: string;
  storageName: string;
  mimetype: string;
  kind: MediaKind;
  sizeBytes: number;
  status: 'temporary' | 'attached';
  createdAt: string;
}

export class MediaValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'MediaValidationError';
  }
}
