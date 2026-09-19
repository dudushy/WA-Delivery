import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { openDatabase } from '../src/database/database.js';
import { SettingsRepository } from '../src/modules/settings/SettingsRepository.js';
import { SettingsService } from '../src/modules/settings/SettingsService.js';
import { DEFAULT_SETTINGS, SettingsValidationError } from '../src/modules/settings/settingsTypes.js';

function createService() {
  const database = openDatabase(':memory:');
  return new SettingsService(new SettingsRepository(database));
}

describe('SettingsService', () => {
  it('retorna os defaults seguros quando nada foi persistido', () => {
    const service = createService();
    assert.deepEqual(service.getAll(), DEFAULT_SETTINGS);
  });

  it('valida e persiste um conjunto parcial de configurações', () => {
    const service = createService();
    const updated = service.update({
      defaultCountryCode: '1',
      defaultAreaCode: '11',
      maxAttempts: 5,
      soundEnabled: false,
    });
    assert.equal(updated.defaultCountryCode, '1');
    assert.equal(updated.defaultAreaCode, '11');
    assert.equal(updated.maxAttempts, 5);
    assert.equal(updated.soundEnabled, false);
    // Campos não informados preservam o default.
    assert.equal(updated.operationTimeoutMs, DEFAULT_SETTINGS.operationTimeoutMs);
  });

  it('rejeita país inválido e limites fora do intervalo', () => {
    const service = createService();
    assert.throws(
      () => service.update({ defaultCountryCode: 'abc' }),
      (error: unknown) => error instanceof SettingsValidationError,
    );
    assert.throws(
      () => service.update({ maxAttempts: 0 }),
      (error: unknown) => error instanceof SettingsValidationError,
    );
    assert.throws(
      () => service.update({ operationTimeoutMs: 100 }),
      (error: unknown) => error instanceof SettingsValidationError,
    );
  });

  it('rejeita teto de backoff menor que o backoff base', () => {
    const service = createService();
    assert.throws(
      () => service.update({ retryBackoffMs: 5_000, retryBackoffCapMs: 1_000 }),
      (error: unknown) => error instanceof SettingsValidationError,
    );
  });

  it('reidrata as configurações persistidas ao reabrir o serviço', () => {
    const database = openDatabase(':memory:');
    const repository = new SettingsRepository(database);
    new SettingsService(repository).update({ defaultAreaCode: '21', maxAttempts: 4 });
    const reopened = new SettingsService(repository);
    assert.equal(reopened.getAll().defaultAreaCode, '21');
    assert.equal(reopened.getAll().maxAttempts, 4);
  });

  it('notifica assinantes quando as configurações mudam', () => {
    const service = createService();
    let received = 0;
    const unsubscribe = service.onChange(() => {
      received += 1;
    });
    service.update({ maxAttempts: 2 });
    unsubscribe();
    service.update({ maxAttempts: 3 });
    assert.equal(received, 1);
  });
});

describe('migração da tabela settings (v8)', () => {
  it('mantém MAX(version) atualizado e permite ler/gravar configurações', () => {
    const database = openDatabase(':memory:');
    assert.equal(
      database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()?.version,
      9,
    );
    const repository = new SettingsRepository(database);
    repository.setAll({ defaultCountryCode: '55' });
    assert.equal(repository.getAll().defaultCountryCode, '55');
  });
});
