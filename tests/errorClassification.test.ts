import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TimeoutError } from '../src/shared/withTimeout.js';
import {
  PermanentError,
  TransientError,
  classifyError,
} from '../src/modules/queue/errorClassification.js';

describe('classifyError', () => {
  it('respeita marcadores explícitos', () => {
    assert.equal(classifyError(new TransientError('rede caiu')), 'transient');
    assert.equal(classifyError(new PermanentError('inválido')), 'permanent');
  });

  it('trata TimeoutError como transitório', () => {
    assert.equal(classifyError(new TimeoutError()), 'transient');
  });

  it('classifica falhas de domínio como permanentes', () => {
    assert.equal(classifyError(new Error('O número não está registrado no WhatsApp.')), 'permanent');
    assert.equal(classifyError(new Error('A mensagem não pode estar vazia.')), 'permanent');
    assert.equal(classifyError(new Error('A mídia da campanha não foi encontrada.')), 'permanent');
    assert.equal(
      classifyError(new Error('O WhatsApp não retornou o identificador da mensagem.')),
      'permanent',
    );
  });

  it('classifica falhas de rede e conexão como transitórias', () => {
    assert.equal(classifyError(new Error('WhatsApp não está conektado.'.replace('k', 'c'))), 'transient');
    assert.equal(classifyError(new Error('Connection closed')), 'transient');
    assert.equal(classifyError(new Error('socket hang up')), 'transient');
    assert.equal(classifyError(new Error('network error')), 'transient');
  });

  it('classifica códigos de rede presentes em error.code', () => {
    const error = Object.assign(new Error('request failed'), { code: 'ECONNRESET' });
    assert.equal(classifyError(error), 'transient');
  });

  it('usa transitório como default seguro para erros desconhecidos', () => {
    assert.equal(classifyError(new Error('algo inesperado ocorreu')), 'transient');
    assert.equal(classifyError('string solta'), 'transient');
  });
});
