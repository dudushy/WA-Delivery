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
    contacts,
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

  it('exclui contatos com opt-out da simulação e do snapshot', () => {
    const { list, contacts, campaigns } = setup();
    // Marca a Ana (primeiro contato) como opt-out.
    const ana = list.contacts[0];
    contacts.setOptOut(list.id, ana.id, true);

    const simulation = campaigns.simulate({
      contactListId: list.id,
      messageTemplate: 'Olá {{nome}}!',
      delayMinSeconds: 1,
      delayMaxSeconds: 1,
    });
    assert.equal(simulation.recipientCount, 2);
    assert.equal(simulation.optedOutCount, 1);
    assert.ok(!simulation.samples.some((sample) => sample.name === 'Ana'));

    const draft = campaigns.createDraft({
      name: 'Sem opt-out',
      contactListId: list.id,
      messageTemplate: 'Olá {{nome}}!',
      delayMinSeconds: 1,
      delayMaxSeconds: 1,
    });
    campaigns.prepareDraft(draft.id, true);
    const recipients = campaigns.listRecipients(draft.id) ?? [];
    assert.equal(recipients.length, 2);
    assert.ok(!recipients.some((r) => r.phone === '5516999999999'));
  });

  it('renderiza variáveis de coluna extra e rejeita variáveis desconhecidas', () => {
    const { contacts, campaigns } = setup();
    const list = contacts.createImportedList({
      name: 'Com colunas',
      contacts: [
        { name: 'Ana', phone: '16999999999', data: { cidade: 'Ribeirão Preto' } },
        { name: 'Maria', phone: '16988888888', data: { cidade: 'Campinas' } },
      ],
    });

    // Variável existente: renderiza o valor da coluna por destinatário.
    const simulation = campaigns.simulate({
      contactListId: list.id,
      messageTemplate: 'Olá {{nome}}, tudo bem em {{cidade}}?',
      delayMinSeconds: 1,
      delayMaxSeconds: 1,
    });
    assert.equal(simulation.samples[0]?.message, 'Olá Ana, tudo bem em Ribeirão Preto?');

    // Variável inexistente na lista é rejeitada.
    assert.throws(
      () =>
        campaigns.simulate({
          contactListId: list.id,
          messageTemplate: 'Olá {{sobrenome}}!',
          delayMinSeconds: 1,
          delayMaxSeconds: 1,
        }),
      (error: unknown) => error instanceof CampaignValidationError,
    );

    // O snapshot preserva a mensagem renderizada com a coluna extra.
    const draft = campaigns.createDraft({
      name: 'Cidades',
      contactListId: list.id,
      messageTemplate: 'Oi {{nome}} de {{cidade}}',
      delayMinSeconds: 1,
      delayMaxSeconds: 1,
    });
    campaigns.prepareDraft(draft.id, true);
    const recipients = campaigns.listRecipients(draft.id) ?? [];
    assert.equal(
      recipients.find((r) => r.name === 'Maria')?.renderedMessage,
      'Oi Maria de Campinas',
    );
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

  it('prepara um snapshot imutável somente após confirmação explícita', () => {
    const { list, contacts, campaigns } = setup();
    const draft = campaigns.createDraft({
      name: 'Campanha confirmada',
      contactListId: list.id,
      messageTemplate: 'Olá {{nome}}!',
      delayMinSeconds: 5,
      delayMaxSeconds: 10,
    });

    assert.throws(() => campaigns.prepareDraft(draft.id, false), CampaignValidationError);
    const prepared = campaigns.prepareDraft(draft.id, true);
    assert.equal(prepared?.status, 'ready');
    assert.equal(campaigns.listRecipients(draft.id)?.[0]?.renderedMessage, 'Olá Ana!');

    contacts.updateContact(list.id, list.contacts[0].id, {
      name: 'Ana alterada',
      phone: '16966666666',
    });
    const recipients = campaigns.listRecipients(draft.id);
    assert.equal(recipients?.length, 3);
    assert.equal(recipients?.[0]?.name, 'Ana');
    assert.equal(recipients?.[0]?.phone, '5516999999999');
    assert.equal(campaigns.findById(draft.id)?.recipientCount, 3);
  });

  it('rejeita variável desconhecida e intervalos inválidos', () => {
    const { list, campaigns } = setup();
    // Intervalo inválido é rejeitado na validação de campos (antes da checagem
    // de variáveis, que agora é ciente das colunas da lista).
    assert.throws(
      () =>
        campaigns.simulate({
          contactListId: list.id,
          messageTemplate: 'Olá {{nome}}',
          delayMinSeconds: 10,
          delayMaxSeconds: 5,
        }),
      (error: unknown) => {
        assert.ok(error instanceof CampaignValidationError);
        assert.ok(error.issues.some((issue) => issue.path === 'delayMaxSeconds'));
        return true;
      },
    );
    // Variável desconhecida (lista sem colunas extras) também é rejeitada.
    assert.throws(
      () =>
        campaigns.simulate({
          contactListId: list.id,
          messageTemplate: 'Olá {{apelido}}',
          delayMinSeconds: 5,
          delayMaxSeconds: 10,
        }),
      (error: unknown) => {
        assert.ok(error instanceof CampaignValidationError);
        assert.ok(error.issues.some((issue) => issue.path === 'messageTemplate'));
        return true;
      },
    );
  });
});

describe('CampaignService.exportRecipientsCsv', () => {
  function build() {
    const database = openDatabase(':memory:');
    const contacts = new ContactService(new ContactRepository(database));
    const list = contacts.createManualList({
      name: 'Clientes',
      contacts: [
        { name: 'Ana', phone: '16999999999' },
        { name: 'Maria, teste', phone: '16988888888' },
      ],
    });
    const campaigns = new CampaignService(
      new CampaignRepository(database),
      contacts,
      new MediaService(new MediaRepository(database), '/tmp/wa-delivery-export-tests'),
    );
    const draft = campaigns.createDraft({
      name: 'C',
      contactListId: list.id,
      messageTemplate: 'Olá {{nome}}!',
      delayMinSeconds: 1,
      delayMaxSeconds: 1,
    });
    campaigns.prepareDraft(draft.id, true);
    return { database, campaigns, draft };
  }

  it('exporta todos os destinatários com cabeçalho e escapa vírgulas', () => {
    const { database, campaigns, draft } = build();
    try {
      const csv = campaigns.exportRecipientsCsv(draft.id);
      assert.ok(csv);
      const lines = csv.trim().split('\r\n');
      assert.equal(lines[0], 'nome,telefone,status,tentativas,enviado_em,ultimo_erro');
      assert.equal(lines.length, 3); // header + 2 destinatários
      assert.ok(lines.some((l) => l.startsWith('"Maria, teste"'))); // escapa vírgula
    } finally {
      database.close();
    }
  });

  it('exporta somente falhas e ignorados quando solicitado', () => {
    const { database, campaigns, draft } = build();
    try {
      const recipients = campaigns.listRecipients(draft.id) ?? [];
      database
        .prepare("UPDATE campaign_recipients SET status = 'sent' WHERE id = ?")
        .run(recipients[0].id);
      database
        .prepare("UPDATE campaign_recipients SET status = 'failed', last_error = 'x' WHERE id = ?")
        .run(recipients[1].id);
      const csv = campaigns.exportRecipientsCsv(draft.id, true);
      assert.ok(csv);
      const lines = csv.trim().split('\r\n');
      assert.equal(lines.length, 2); // header + 1 falha
      assert.ok(lines[1].includes('failed'));
    } finally {
      database.close();
    }
  });

  it('retorna undefined para campanha inexistente', () => {
    const { database, campaigns } = build();
    try {
      assert.equal(campaigns.exportRecipientsCsv(999999), undefined);
    } finally {
      database.close();
    }
  });

  it('neutraliza CSV formula injection em nomes', () => {
    const database = openDatabase(':memory:');
    try {
      const contacts = new ContactService(new ContactRepository(database));
      const list = contacts.createManualList({
        name: 'Perigosos',
        contacts: [
          { name: '=SUM(A1:A9)', phone: '16999999999' },
          { name: '@cmd', phone: '16988888888' },
        ],
      });
      const campaigns = new CampaignService(
        new CampaignRepository(database),
        contacts,
        new MediaService(new MediaRepository(database), '/tmp/wa-delivery-inj-tests'),
      );
      const draft = campaigns.createDraft({
        name: 'Inj',
        contactListId: list.id,
        messageTemplate: 'Oi {{nome}}',
        delayMinSeconds: 1,
        delayMaxSeconds: 1,
      });
      campaigns.prepareDraft(draft.id, true);
      const csv = campaigns.exportRecipientsCsv(draft.id);
      assert.ok(csv);
      // Nomes iniciados por = ou @ recebem aspa simples de proteção.
      assert.ok(csv.includes("'=SUM(A1:A9)"));
      assert.ok(csv.includes("'@cmd"));
      // Não deve existir uma célula que comece diretamente com = ou @.
      const dataLines = csv.trim().split('\r\n').slice(1);
      for (const line of dataLines) {
        assert.ok(!/^[=+@]/.test(line));
      }
    } finally {
      database.close();
    }
  });
});

describe('renderMessage', () => {
  it('substitui nome ignorando espaços e caixa', () => {
    assert.equal(renderMessage('Oi {{ NOME }}!', 'Andrea'), 'Oi Andrea!');
  });
});

describe('CampaignService.createFollowUp', () => {
  function prepareAndReady(campaigns: CampaignService, listId: number) {
    const campaign = campaigns.createDraft({
      name: 'Original',
      contactListId: listId,
      messageTemplate: 'Olá {{nome}}!',
      delayMinSeconds: 5,
      delayMaxSeconds: 10,
    });
    campaigns.prepareDraft(campaign.id, true);
    return campaign;
  }

  function buildWithList(contactsList: Array<{ name: string; phone: string }>) {
    const database = openDatabase(':memory:');
    const contacts = new ContactService(new ContactRepository(database));
    const list = contacts.createManualList({ name: 'Clientes', contacts: contactsList });
    const campaigns = new CampaignService(
      new CampaignRepository(database),
      contacts,
      new MediaService(new MediaRepository(database), '/tmp/wa-delivery-followup-tests'),
    );
    return { database, list, campaigns };
  }

  it('cria uma nova campanha vinculada apenas com os pendentes', () => {
    const { database, list, campaigns } = buildWithList([
      { name: 'Ana', phone: '16999999999' },
      { name: 'Maria', phone: '16988888888' },
      { name: 'João', phone: '16977777777' },
    ]);
    try {
      const original = prepareAndReady(campaigns, list.id);
      const recipients = campaigns.listRecipients(original.id) ?? [];
      database
        .prepare("UPDATE campaign_recipients SET status = 'sent' WHERE id = ?")
        .run(recipients[0].id);
      database
        .prepare("UPDATE campaign_recipients SET status = 'failed' WHERE id = ?")
        .run(recipients[1].id);
      database
        .prepare("UPDATE campaign_recipients SET status = 'skipped' WHERE id = ?")
        .run(recipients[2].id);
      database.prepare("UPDATE campaigns SET status = 'completed' WHERE id = ?").run(original.id);

      const followUp = campaigns.createFollowUp(original.id);
      assert.equal(followUp.status, 'ready');
      assert.equal(followUp.sourceCampaignId, original.id);
      const followUpRecipients = campaigns.listRecipients(followUp.id) ?? [];
      assert.equal(followUpRecipients.length, 2); // apenas failed + skipped
      assert.ok(followUpRecipients.every((r) => r.status === 'pending'));
      // A campanha original permanece intacta.
      assert.equal(campaigns.listRecipients(original.id)?.length, 3);
      assert.equal(campaigns.findById(original.id)?.status, 'completed');
    } finally {
      database.close();
    }
  });

  it('rejeita reenvio quando a campanha não é terminal', () => {
    const { database, list, campaigns } = buildWithList([{ name: 'Ana', phone: '16999999999' }]);
    try {
      const original = prepareAndReady(campaigns, list.id); // fica em 'ready'
      assert.throws(() => campaigns.createFollowUp(original.id), CampaignValidationError);
    } finally {
      database.close();
    }
  });

  it('rejeita reenvio quando não há pendentes', () => {
    const { database, list, campaigns } = buildWithList([{ name: 'Ana', phone: '16999999999' }]);
    try {
      const original = prepareAndReady(campaigns, list.id);
      const recipients = campaigns.listRecipients(original.id) ?? [];
      database
        .prepare("UPDATE campaign_recipients SET status = 'sent' WHERE id = ?")
        .run(recipients[0].id);
      database.prepare("UPDATE campaigns SET status = 'completed' WHERE id = ?").run(original.id);
      assert.throws(() => campaigns.createFollowUp(original.id), CampaignValidationError);
    } finally {
      database.close();
    }
  });
});

describe('CampaignService.deleteCampaign', () => {
  function makeService() {
    const database = openDatabase(':memory:');
    const contacts = new ContactService(new ContactRepository(database));
    const list = contacts.createManualList({
      name: 'L',
      contacts: [{ name: 'Ana', phone: '16999999999' }],
    });
    const campaigns = new CampaignService(
      new CampaignRepository(database),
      contacts,
      new MediaService(new MediaRepository(database), '/tmp/wa-delivery-delete-tests'),
    );
    return { database, list, campaigns };
  }

  it('exclui uma campanha em estado terminal', async () => {
    const { database, list, campaigns } = makeService();
    try {
      const campaign = campaigns.createDraft({
        name: 'X',
        contactListId: list.id,
        messageTemplate: 'Olá!',
        delayMinSeconds: 1,
        delayMaxSeconds: 1,
      });
      database.prepare("UPDATE campaigns SET status = 'completed' WHERE id = ?").run(campaign.id);
      assert.equal(await campaigns.deleteCampaign(campaign.id), true);
      assert.equal(campaigns.findById(campaign.id), undefined);
    } finally {
      database.close();
    }
  });

  it('não exclui uma campanha em execução', async () => {
    const { database, list, campaigns } = makeService();
    try {
      const campaign = campaigns.createDraft({
        name: 'X',
        contactListId: list.id,
        messageTemplate: 'Olá!',
        delayMinSeconds: 1,
        delayMaxSeconds: 1,
      });
      database.prepare("UPDATE campaigns SET status = 'running' WHERE id = ?").run(campaign.id);
      assert.equal(await campaigns.deleteCampaign(campaign.id), false);
      assert.ok(campaigns.findById(campaign.id));
    } finally {
      database.close();
    }
  });
});

describe('CampaignService.cleanupOldCampaigns', () => {
  function makeService() {
    const database = openDatabase(':memory:');
    const contacts = new ContactService(new ContactRepository(database));
    const list = contacts.createManualList({
      name: 'L',
      contacts: [{ name: 'Ana', phone: '16999999999' }],
    });
    const campaigns = new CampaignService(
      new CampaignRepository(database),
      contacts,
      new MediaService(new MediaRepository(database), '/tmp/wa-delivery-cleanup-tests'),
    );
    return { database, list, campaigns };
  }

  it('remove campanhas finalizadas antigas e preserva as recentes', async () => {
    const { database, list, campaigns } = makeService();
    try {
      const old = campaigns.createDraft({
        name: 'Antiga',
        contactListId: list.id,
        messageTemplate: 'Oi',
        delayMinSeconds: 1,
        delayMaxSeconds: 1,
      });
      const recent = campaigns.createDraft({
        name: 'Recente',
        contactListId: list.id,
        messageTemplate: 'Oi',
        delayMinSeconds: 1,
        delayMaxSeconds: 1,
      });
      // Antiga: finalizada há 60 dias. Recente: finalizada agora.
      database
        .prepare(
          "UPDATE campaigns SET status = 'completed', finished_at = datetime('now', '-60 days') WHERE id = ?",
        )
        .run(old.id);
      database
        .prepare(
          "UPDATE campaigns SET status = 'completed', finished_at = datetime('now') WHERE id = ?",
        )
        .run(recent.id);

      const removed = await campaigns.cleanupOldCampaigns(30);
      assert.equal(removed, 1);
      assert.equal(campaigns.findById(old.id), undefined);
      assert.ok(campaigns.findById(recent.id));
    } finally {
      database.close();
    }
  });

  it('não remove nada quando a retenção está desativada (0)', async () => {
    const { database, list, campaigns } = makeService();
    try {
      const campaign = campaigns.createDraft({
        name: 'X',
        contactListId: list.id,
        messageTemplate: 'Oi',
        delayMinSeconds: 1,
        delayMaxSeconds: 1,
      });
      database
        .prepare(
          "UPDATE campaigns SET status = 'completed', finished_at = datetime('now', '-999 days') WHERE id = ?",
        )
        .run(campaign.id);
      assert.equal(await campaigns.cleanupOldCampaigns(0), 0);
      assert.ok(campaigns.findById(campaign.id));
    } finally {
      database.close();
    }
  });

  it('não remove campanhas ativas mesmo que antigas', async () => {
    const { database, list, campaigns } = makeService();
    try {
      const campaign = campaigns.createDraft({
        name: 'Ativa',
        contactListId: list.id,
        messageTemplate: 'Oi',
        delayMinSeconds: 1,
        delayMaxSeconds: 1,
      });
      // draft antigo não tem finished_at; não deve ser removido.
      database
        .prepare("UPDATE campaigns SET created_at = datetime('now', '-999 days') WHERE id = ?")
        .run(campaign.id);
      assert.equal(await campaigns.cleanupOldCampaigns(30), 0);
      assert.ok(campaigns.findById(campaign.id));
    } finally {
      database.close();
    }
  });
});
