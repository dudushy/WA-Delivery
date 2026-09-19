import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { openDatabase } from '../src/database/database.js';
import { ContactRepository } from '../src/modules/contacts/ContactRepository.js';
import { ContactService } from '../src/modules/contacts/ContactService.js';
import { ContactValidationError } from '../src/modules/contacts/contactTypes.js';

function createService(): ContactService {
  return new ContactService(new ContactRepository(openDatabase(':memory:')));
}

describe('ContactService', () => {
  it('cria e recupera lista manual com telefones normalizados', () => {
    const service = createService();
    const created = service.createManualList({
      name: ' Clientes próximos ',
      contacts: [
        { name: ' Andrea ', phone: '(16) 99999-9999' },
        { name: 'Maria', phone: '+55 16 98888-8888' },
      ],
    });

    assert.equal(created.name, 'Clientes próximos');
    assert.equal(created.source, 'manual');
    assert.equal(created.contactCount, 2);
    assert.deepEqual(created.contacts.map(({ name, phone }) => ({ name, phone })), [
      { name: 'Andrea', phone: '5516999999999' },
      { name: 'Maria', phone: '5516988888888' },
    ]);
    assert.equal(service.list()[0]?.contactCount, 2);
  });

  it('reutiliza o mesmo telefone globalmente em listas diferentes', () => {
    const service = createService();
    service.createManualList({ name: 'Lista A', contacts: [{ name: 'Ana', phone: '16999999999' }] });
    const second = service.createManualList({
      name: 'Lista B',
      contacts: [{ name: 'Ana Cliente', phone: '16 99999-9999' }],
    });

    assert.equal(second.contacts[0]?.name, 'Ana Cliente');
    assert.equal(second.contacts[0]?.phone, '5516999999999');
  });

  it('rejeita lista vazia, nomes ausentes e telefones inválidos', () => {
    const service = createService();
    assert.throws(
      () => service.createManualList({ name: '', contacts: [{ name: '', phone: '123' }] }),
      (error: unknown) => {
        assert.ok(error instanceof ContactValidationError);
        assert.equal(error.issues.length, 3);
        return true;
      },
    );
  });

  it('rejeita telefones duplicados dentro da mesma lista', () => {
    const service = createService();
    assert.throws(
      () => service.createManualList({
        name: 'Duplicados',
        contacts: [
          { name: 'Ana', phone: '(16) 99999-9999' },
          { name: 'Ana novamente', phone: '16999999999' },
        ],
      }),
      (error: unknown) => {
        assert.ok(error instanceof ContactValidationError);
        assert.match(error.issues[0]?.message ?? '', /duplicado/);
        return true;
      },
    );
  });

  it('renomeia lista e permite adicionar, editar e remover contatos', () => {
    const service = createService();
    const created = service.createManualList({
      name: 'Original',
      contacts: [{ name: 'Ana', phone: '16999999999' }],
    });
    const renamed = service.renameList(created.id, 'Clientes atualizados');
    assert.equal(renamed?.name, 'Clientes atualizados');

    const withNewContact = service.addContact(created.id, {
      name: 'Maria',
      phone: '16988888888',
    });
    assert.equal(withNewContact?.contactCount, 2);
    const maria = withNewContact?.contacts.find((contact) => contact.name === 'Maria');
    assert.ok(maria);

    const edited = service.updateContact(created.id, maria.id, {
      name: 'Maria Silva',
      phone: '16977777777',
    });
    assert.equal(edited?.contacts.find((contact) => contact.id === maria.id)?.phone, '5516977777777');

    const afterRemoval = service.deleteContact(created.id, maria.id);
    assert.equal(afterRemoval?.contactCount, 1);
    assert.equal(service.deleteList(created.id), true);
    assert.equal(service.findById(created.id), undefined);
  });

  it('impede duplicar telefone ao editar ou adicionar na mesma lista', () => {
    const service = createService();
    const created = service.createManualList({
      name: 'Sem duplicados',
      contacts: [{ name: 'Ana', phone: '16999999999' }],
    });

    assert.throws(
      () => service.addContact(created.id, { name: 'Repetida', phone: '(16) 99999-9999' }),
      /já existe/,
    );
  });
});
