import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { maskPhone, maskSensitive } from '../src/shared/logger.js';

describe('maskPhone', () => {
  it('preserva início e fim, mascarando o miolo', () => {
    assert.equal(maskPhone('5516999998888'), '5516*****8888');
  });
  it('remove formatação antes de mascarar', () => {
    assert.equal(maskPhone('+55 (16) 99999-8888'), '5516*****8888');
  });
  it('mascara completamente números muito curtos', () => {
    assert.equal(maskPhone('12345'), '*****');
  });
  it('não expõe todos os dígitos de um número comum', () => {
    const masked = maskPhone('5516999998888');
    assert.ok(masked.includes('*'));
    assert.ok(!masked.includes('99999'));
  });
});

describe('maskSensitive', () => {
  it('mascara telefones embutidos em texto livre', () => {
    const masked = maskSensitive('Falha ao enviar para 5516999998888 agora');
    assert.ok(!masked.includes('5516999998888'));
    assert.ok(masked.includes('5516*****8888'));
  });
  it('oculta pares de credencial', () => {
    const masked = maskSensitive('erro token: abc123secret');
    assert.ok(!masked.includes('abc123secret'));
    assert.match(masked, /token: \[oculto\]/);
  });
});
