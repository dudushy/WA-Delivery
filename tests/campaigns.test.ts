import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { openDatabase } from '../src/database/database.js';
import { CampaignRepository } from '../src/modules/campaigns/CampaignRepository.js';
import { CampaignService, renderMessage } from '../src/modules/campaigns/CampaignService.js';
import { CampaignValidationError } from '../src/modules/campaigns/campaignTypes.js';
import { ContactRepository } from '../src/modules/contacts/ContactRepository.js';
import { ContactService } from '../src/modules/contacts/ContactService.js';
import { MediaRepository } from '../src/modules/media/MediaRepository.js';
import { MediaService } from '../src/modules/media/MediaService.js';

function setup() {
  const database = openDatabase(':memory:');
  const contacts = new ContactService(new ContactRepository(database));
  const list = contacts.createManualList({
    name: 'Clientes',
    contacts: [
      { name: 'Ana', phone: '16999999999' },
      { name: 'Maria', phone: '16988888888' },
      { name: 'João', phone: '16977777777' },
    ],
  });
  return {
    list,
    campaigns: new CampaignService(
      new CampaignRepository(database),
      contacts,
      new MediaService(new MediaRepository(database), '/tmp/wa-delivery-campaign-tests'),
    ),
  };
}

describe('CampaignService', () => {
  it('simula duração e personaliza amostras sem enviar', () => {
    const { list, campaigns } = setup();
    const simulation = campaigns.simulate({
      contactListId: list.id,
      messageTemplate: 'Olá {{nome}}, temos novidades!',
      delayMinSeconds: 4,
      delayMaxSeconds: 8,
    });

    assert.equal(simulation.recipientCount, 3);
    assert.equal(simulation.durationMinSeconds, 8);
    assert.equal(simulation.durationAverageSeconds, 12);
    assert.equal(simulation.durationMaxSeconds, 16);
    assert.equal(simulation.samples[0]?.message, 'Olá Ana, temos novidades!');
  });

  it('salva campanha somente como rascunho', () => {
    const { list, campaigns } = setup();
    const draft = campaigns.createDraft({
      name: 'Campanha setembro',
      contactListId: list.id,
      messageTemplate: 'Olá {{nome}}!',
      delayMinSeconds: 5,
      delayMaxSeconds: 10,
    });

    assert.equal(draft.status, 'draft');
    assert.equal(draft.recipientCount, 3);
    assert.equal(campaigns.list().length, 1);
  });

  it('edita os campos de um rascunho existente', async () => {
    const { list, campaigns } = setup();
    const draft = campaigns.createDraft({
      name: 'Nome inicial',
      contactListId: list.id,
      messageTemplate: 'Olá {{nome}}!',
      delayMinSeconds: 5,
      delayMaxSeconds: 10,
    });

    const updated = await campaigns.updateDraft(draft.id, {
      name: 'Nome atualizado',
      contactListId: list.id,
      messageTemplate: 'Oi {{nome}}, mensagem editada.',
      delayMinSeconds: 3,
      delayMaxSeconds: 7,
      mediaId: null,
    });

    assert.equal(updated?.name, 'Nome atualizado');
    assert.equal(updated?.messageTemplate, 'Oi {{nome}}, mensagem editada.');
    assert.equal(updated?.delayMinSeconds, 3);
    assert.equal(updated?.delayMaxSeconds, 7);
  });

  it('rejeita variável desconhecida e intervalos inválidos', () => {
    const { list, campaigns } = setup();
    assert.throws(
      () => campaigns.simulate({
        contactListId: list.id,
        messageTemplate: 'Olá {{apelido}}',
        delayMinSeconds: 10,
        delayMaxSeconds: 5,
      }),
      (error: unknown) => {
        assert.ok(error instanceof CampaignValidationError);
        assert.equal(error.issues.length, 2);
        return true;
      },
    );
  });
});

describe('renderMessage', () => {
  it('substitui nome ignorando espaços e caixa', () => {
    assert.equal(renderMessage('Oi {{ NOME }}!', 'Andrea'), 'Oi Andrea!');
  });
});
