import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Boom } from '@hapi/boom';
import { DisconnectReason } from '@whiskeysockets/baileys';
import { decideDisconnect } from '../src/providers/whatsapp/baileys/disconnect.js';

describe('decideDisconnect', () => {
  it('não reconecta uma sessão encerrada por logout', () => {
    const decision = decideDisconnect(
      new Boom('logged out', { statusCode: DisconnectReason.loggedOut }),
    );
    assert.deepEqual(decision, {
      shouldReconnect: false,
      loggedOut: true,
      statusCode: DisconnectReason.loggedOut,
    });
  });
  it('reconecta falhas transitórias', () => {
    const decision = decideDisconnect(new Boom('unavailable', { statusCode: 503 }));
    assert.deepEqual(decision, { shouldReconnect: true, loggedOut: false, statusCode: 503 });
  });
  it('trata erros desconhecidos como recuperáveis', () => {
    assert.deepEqual(decideDisconnect(new Error('network')), {
      shouldReconnect: true,
      loggedOut: false,
    });
  });
});
