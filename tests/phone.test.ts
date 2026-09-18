import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizePhone, toWhatsAppJid } from '../src/modules/contacts/phone.js';

describe('normalizePhone', () => {
  it('remove formatação e adiciona o código do Brasil a número local', () => {
    assert.equal(normalizePhone('(16) 99999-9999'), '5516999999999');
  });
  it('preserva um número internacional explícito', () => {
    assert.equal(normalizePhone('+1 (415) 555-2671'), '14155552671');
  });
  it('remove prefixo internacional 00', () => {
    assert.equal(normalizePhone('00 351 912 345 678'), '351912345678');
  });
  it('rejeita números curtos ou longos', () => {
    assert.throws(() => normalizePhone('1234'), /8 e 15 dígitos/);
    assert.throws(() => normalizePhone('1234567890123456'), /8 e 15 dígitos/);
  });
});

describe('toWhatsAppJid', () => {
  it('converte telefone para JID individual', () => {
    assert.equal(toWhatsAppJid('16 99999-9999'), '5516999999999@s.whatsapp.net');
  });
});
