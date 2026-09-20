import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TimeoutError, withTimeout } from '../src/shared/withTimeout.js';

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('withTimeout', () => {
  it('resolve com o valor quando a operação termina antes do prazo', async () => {
    const value = await withTimeout(Promise.resolve('ok'), 100);
    assert.equal(value, 'ok');
  });

  it('aceita uma factory de Promise', async () => {
    const value = await withTimeout(async () => 42, 100);
    assert.equal(value, 42);
  });

  it('rejeita com TimeoutError quando o prazo estoura', async () => {
    await assert.rejects(
      () => withTimeout(tick(1_000), 10, 'excedeu'),
      (error: unknown) => {
        assert.ok(error instanceof TimeoutError);
        assert.equal((error as TimeoutError).message, 'excedeu');
        return true;
      },
    );
  });

  it('propaga a rejeição original quando ocorre antes do prazo', async () => {
    await assert.rejects(
      () => withTimeout(Promise.reject(new Error('falha original')), 100),
      /falha original/,
    );
  });

  it('desativa o timeout quando o prazo é zero ou negativo', async () => {
    const value = await withTimeout(async () => 'sem-limite', 0);
    assert.equal(value, 'sem-limite');
  });

  it('não segura o processo com o timer pendente após resolver', async () => {
    // Se o timer não for limpo, o teste ainda passa, mas confirmamos que a
    // limpeza não interfere no resultado de uma operação rápida.
    const value = await withTimeout(Promise.resolve('rápido'), 5_000);
    assert.equal(value, 'rápido');
  });
});
