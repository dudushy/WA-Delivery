import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseVersion,
  compareVersions,
  checkNodeVersion,
  isHealthy,
  requiredNodeFromNvmrc,
} from '../scripts/setupLib.ts';

describe('parseVersion', () => {
  it('interpreta versões com e sem prefixo v e patch', () => {
    assert.deepEqual(parseVersion('v24.14.0'), [24, 14, 0]);
    assert.deepEqual(parseVersion('24.14'), [24, 14, 0]);
    assert.deepEqual(parseVersion('node v20.11.1'), [20, 11, 1]);
  });
  it('retorna undefined para entradas sem versão', () => {
    assert.equal(parseVersion('sem numero'), undefined);
    assert.equal(parseVersion(''), undefined);
  });
});

describe('compareVersions', () => {
  it('ordena corretamente', () => {
    assert.equal(compareVersions([24, 14, 0], [24, 14, 0]), 0);
    assert.equal(compareVersions([24, 13, 9], [24, 14, 0]), -1);
    assert.equal(compareVersions([25, 0, 0], [24, 14, 0]), 1);
  });
});

describe('checkNodeVersion', () => {
  it('aprova versão igual ou superior à exigida', () => {
    const result = checkNodeVersion('v24.14.0', '24.14.0');
    assert.equal(result.ok, true);
    const newer = checkNodeVersion('v25.1.0', '24.14.0');
    assert.equal(newer.ok, true);
  });
  it('reprova versão antiga com mensagem orientando o LTS', () => {
    const result = checkNodeVersion('v18.19.0', '24.14.0');
    assert.equal(result.ok, false);
    assert.match(result.message, /24\.14\.0/);
    assert.match(result.message, /nodejs\.org/);
  });
  it('reprova quando a versão atual é irreconhecível', () => {
    const result = checkNodeVersion('desconhecida', '24.14.0');
    assert.equal(result.ok, false);
  });
});

describe('isHealthy', () => {
  it('reconhece o corpo de health check saudável', () => {
    assert.equal(isHealthy('{"status":"ok"}'), true);
  });
  it('rejeita corpos inesperados ou inválidos', () => {
    assert.equal(isHealthy('{"status":"degraded"}'), false);
    assert.equal(isHealthy('nao é json'), false);
    assert.equal(isHealthy(''), false);
  });
});

describe('requiredNodeFromNvmrc', () => {
  it('extrai a versão do .nvmrc', () => {
    assert.equal(requiredNodeFromNvmrc('24.14.0\n'), '24.14.0');
  });
  it('usa o fallback quando ausente/ inválido', () => {
    assert.equal(requiredNodeFromNvmrc(undefined), '24.14.0');
    assert.equal(requiredNodeFromNvmrc('lts/*', '24.14.0'), '24.14.0');
  });
});
