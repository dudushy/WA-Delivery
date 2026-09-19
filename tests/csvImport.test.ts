import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import iconv from 'iconv-lite';
import { openDatabase } from '../src/database/database.js';
import { ContactRepository } from '../src/modules/contacts/ContactRepository.js';
import { ContactService } from '../src/modules/contacts/ContactService.js';
import { CsvImportService } from '../src/modules/contacts/CsvImportService.js';

function createService(): CsvImportService {
  const contacts = new ContactService(new ContactRepository(openDatabase(':memory:')));
  return new CsvImportService(contacts);
}

describe('CsvImportService', () => {
  it('detecta ponto e vírgula e sugere colunas de telefone e nome', () => {
    const service = createService();
    const preview = service.createPreview(
      'clientes.csv',
      Buffer.from('Nome;Telefone;Cidade\nAna;(16) 99999-9999;Ribeirão Preto\n'),
    );

    assert.equal(preview.delimiter, ';');
    assert.equal(preview.rowCount, 1);
    assert.equal(preview.phoneCandidates[0]?.header, 'Telefone');
    assert.equal(preview.nameCandidates[0]?.header, 'Nome');
    assert.equal(preview.rows[0]?.Cidade, 'Ribeirão Preto');
  });

  it('decodifica CSV Windows-1252', () => {
    const service = createService();
    const buffer = iconv.encode('Nome,Telefone\nJosé,16999999999\n', 'windows-1252');
    const preview = service.createPreview('acentos.csv', buffer);

    assert.equal(preview.rows[0]?.Nome, 'José');
  });

  it('analisa válidos, inválidos e duplicados antes de salvar', () => {
    const service = createService();
    const preview = service.createPreview(
      'clientes.csv',
      Buffer.from([
        'Nome,Telefone',
        'Ana,16999999999',
        'Duplicada,(16) 99999-9999',
        'Inválido,123',
        'Maria,16988888888',
      ].join('\n')),
    );
    const analysis = service.analyze(preview.previewId, 'Telefone', 'Nome');

    assert.deepEqual(
      { total: analysis.total, valid: analysis.valid, invalid: analysis.invalid, duplicates: analysis.duplicates },
      { total: 4, valid: 2, invalid: 1, duplicates: 1 },
    );
  });

  it('confirma apenas contatos válidos e únicos', () => {
    const service = createService();
    const preview = service.createPreview(
      'clientes.csv',
      Buffer.from('Nome,Telefone\nAna,16999999999\nRepetida,16999999999\nErro,1\n'),
    );
    const list = service.confirm(preview.previewId, 'Importados', 'Telefone', 'Nome');

    assert.equal(list.source, 'csv');
    assert.equal(list.contactCount, 1);
    assert.equal(list.contacts[0]?.name, 'Ana');
  });
});
