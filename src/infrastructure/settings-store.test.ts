import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import type { SecretStore } from './secret-store.js';
import { SettingsStore } from './settings-store.js';

class MemorySecretStore implements SecretStore {
  value: string | null = null;
  async get() { return this.value; }
  async set(secret: string) { this.value = secret; }
  async delete() { this.value = null; }
}

const directories: string[] = [];
afterEach(async () => {
  delete process.env.META_ACCESS_TOKEN;
  delete process.env.META_PHONE_NUMBER_ID;
  delete process.env.META_WABA_ID;
  delete process.env.META_API_VERSION;
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

test('persiste dados não sensíveis sem gravar o token no arquivo', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wa-delivery-test-'));
  directories.push(directory);
  const secrets = new MemorySecretStore();
  const store = new SettingsStore(secrets, directory);

  const result = await store.save({ phoneNumberId: '123', wabaId: '456', apiVersion: 'v26.0' }, 'secret-token');
  const file = await readFile(join(directory, 'config.json'), 'utf8');

  assert.equal(result.hasAccessToken, true);
  assert.equal(secrets.value, 'secret-token');
  assert.equal(file.includes('secret-token'), false);
  assert.equal(JSON.parse(file).phoneNumberId, '123');
});

test('remove o token do cofre', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wa-delivery-test-'));
  directories.push(directory);
  const secrets = new MemorySecretStore();
  secrets.value = 'secret-token';
  const store = new SettingsStore(secrets, directory);

  await store.deleteAccessToken();
  assert.equal(secrets.value, null);
});
