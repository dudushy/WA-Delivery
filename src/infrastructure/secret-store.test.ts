import assert from 'node:assert/strict';
import { test } from 'node:test';
import { configureBackend } from './secret-store.js';

test('usa arquivo criptografado quando executado no WSL', () => {
  const env: NodeJS.ProcessEnv = { WSL_DISTRO_NAME: 'Ubuntu' };

  configureBackend(env, 'linux');

  assert.equal(env.TS_KEYRING_BACKEND, 'file');
});

test('preserva backend escolhido explicitamente pelo usuário', () => {
  const env: NodeJS.ProcessEnv = {
    WSL_DISTRO_NAME: 'Ubuntu',
    TS_KEYRING_BACKEND: 'secret-service',
  };

  configureBackend(env, 'linux');

  assert.equal(env.TS_KEYRING_BACKEND, 'secret-service');
});

test('deixa o cross-keychain detectar o backend no Linux desktop', () => {
  const env: NodeJS.ProcessEnv = {};

  configureBackend(env, 'linux');

  assert.equal(env.TS_KEYRING_BACKEND, undefined);
});
