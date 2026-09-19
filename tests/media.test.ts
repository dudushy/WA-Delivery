import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { openDatabase } from '../src/database/database.js';
import { CampaignRepository } from '../src/modules/campaigns/CampaignRepository.js';
import { CampaignService } from '../src/modules/campaigns/CampaignService.js';
import { ContactRepository } from '../src/modules/contacts/ContactRepository.js';
import { ContactService } from '../src/modules/contacts/ContactService.js';
import { MediaRepository } from '../src/modules/media/MediaRepository.js';
import { MediaService } from '../src/modules/media/MediaService.js';
import { MediaValidationError } from '../src/modules/media/mediaTypes.js';

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

describe('MediaService', () => {
  it('valida assinatura, salva mídia e remove o arquivo com o rascunho', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wa-delivery-media-'));
    const database = openDatabase(':memory:');
    try {
      const repository = new MediaRepository(database);
      const media = new MediaService(repository, directory);
      const uploaded = await media.upload('foto.png', 'image/png', png);
      const storedPath = join(directory, uploaded.storageName);
      assert.equal(uploaded.kind, 'image');
      assert.equal(uploaded.status, 'temporary');
      assert.equal(existsSync(storedPath), true);

      const contacts = new ContactService(new ContactRepository(database));
      const list = contacts.createManualList({
        name: 'Clientes',
        contacts: [{ name: 'Ana', phone: '16999999999' }],
      });
      const campaigns = new CampaignService(new CampaignRepository(database), contacts, media);
      const draft = campaigns.createDraft({
        name: 'Com imagem',
        contactListId: list.id,
        messageTemplate: 'Olá {{nome}}!',
        delayMinSeconds: 2,
        delayMaxSeconds: 4,
        mediaId: uploaded.id,
      });

      assert.equal(draft.media?.originalName, 'foto.png');
      assert.equal(repository.findById(uploaded.id)?.status, 'attached');

      const replacement = await media.upload('nova-foto.png', 'image/png', png);
      const replacementPath = join(directory, replacement.storageName);
      const updated = await campaigns.updateDraft(draft.id, {
        name: 'Com nova imagem',
        contactListId: list.id,
        messageTemplate: 'Olá {{nome}}!',
        delayMinSeconds: 2,
        delayMaxSeconds: 4,
        mediaId: replacement.id,
      });
      assert.equal(updated?.media?.originalName, 'nova-foto.png');
      assert.equal(existsSync(storedPath), false);
      assert.equal(repository.findById(uploaded.id), undefined);
      assert.equal(existsSync(replacementPath), true);

      const withoutMedia = await campaigns.updateDraft(draft.id, {
        name: 'Sem imagem',
        contactListId: list.id,
        messageTemplate: 'Olá {{nome}}!',
        delayMinSeconds: 2,
        delayMaxSeconds: 4,
        mediaId: null,
      });
      assert.equal(withoutMedia?.media, undefined);
      assert.equal(existsSync(replacementPath), false);
      assert.equal(await campaigns.deleteDraft(draft.id), true);
    } finally {
      database.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejeita conteúdo incompatível com o tipo informado', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wa-delivery-media-'));
    const database = openDatabase(':memory:');
    try {
      const media = new MediaService(new MediaRepository(database), directory);
      await assert.rejects(
        () => media.upload('falsa.png', 'image/png', Buffer.from('não é png')),
        MediaValidationError,
      );
      await assert.rejects(
        () => media.upload('arquivo.gif', 'image/gif', Buffer.from('GIF89a')),
        MediaValidationError,
      );
    } finally {
      database.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
