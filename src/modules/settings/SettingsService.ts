import { SettingsRepository } from './SettingsRepository.js';
import {
  DEFAULT_SETTINGS,
  SettingsValidationError,
  type AppSettings,
  type SettingsValidationIssue,
} from './settingsTypes.js';

/**
 * Lê e grava as configurações operacionais, aplicando defaults seguros e
 * validando cada campo no backend. Mantém um cache em memória para leitura
 * rápida pelo worker e notifica assinantes quando os valores mudam.
 */
export class SettingsService {
  private cache: AppSettings;
  private readonly listeners = new Set<(settings: AppSettings) => void>();

  public constructor(private readonly repository: SettingsRepository) {
    this.cache = this.load();
  }

  /** Retorna uma cópia das configurações atuais (defaults + valores persistidos). */
  public getAll(): AppSettings {
    return { ...this.cache };
  }

  /** Valida e persiste um conjunto parcial de configurações; retorna o estado final. */
  public update(input: Partial<Record<keyof AppSettings, unknown>>): AppSettings {
    const merged = { ...this.cache };
    const issues: SettingsValidationIssue[] = [];

    const parseDigits = (key: keyof AppSettings, label: string, allowEmpty: boolean): void => {
      if (input[key] === undefined) return;
      const raw = String(input[key] ?? '').trim();
      if (raw === '') {
        if (allowEmpty) {
          (merged[key] as string) = '';
          return;
        }
        issues.push({ path: key, message: `Informe ${label}.` });
        return;
      }
      if (!/^\d{1,4}$/.test(raw)) {
        issues.push({ path: key, message: `${label} deve conter apenas dígitos (até 4).` });
        return;
      }
      (merged[key] as string) = raw;
    };

    const parseInt = (
      key: keyof AppSettings,
      label: string,
      min: number,
      max: number,
    ): void => {
      if (input[key] === undefined) return;
      const value = Number(input[key]);
      if (!Number.isInteger(value) || value < min || value > max) {
        issues.push({ path: key, message: `${label} deve ser um inteiro entre ${min} e ${max}.` });
        return;
      }
      (merged[key] as number) = value;
    };

    parseDigits('defaultCountryCode', 'o código do país', false);
    parseDigits('defaultAreaCode', 'o DDD padrão', true);
    parseInt('operationTimeoutMs', 'O tempo limite', 1_000, 300_000);
    parseInt('maxAttempts', 'O limite de tentativas', 1, 10);
    parseInt('retryBackoffMs', 'O backoff base', 0, 60_000);
    parseInt('retryBackoffCapMs', 'O teto do backoff', 0, 600_000);
    parseInt('retentionDays', 'A retenção', 0, 3_650);

    if (input.soundEnabled !== undefined) {
      merged.soundEnabled = Boolean(input.soundEnabled);
    }
    if (input.onboardingCompleted !== undefined) {
      merged.onboardingCompleted = Boolean(input.onboardingCompleted);
    }

    if (merged.retryBackoffCapMs < merged.retryBackoffMs) {
      issues.push({
        path: 'retryBackoffCapMs',
        message: 'O teto do backoff não pode ser menor que o backoff base.',
      });
    }

    if (issues.length > 0) throw new SettingsValidationError(issues);

    this.repository.setAll(serialize(merged));
    this.cache = merged;
    for (const listener of this.listeners) listener({ ...merged });
    return { ...merged };
  }

  /** Assina mudanças nas configurações; retorna uma função de cancelamento. */
  public onChange(listener: (settings: AppSettings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private load(): AppSettings {
    const stored = this.repository.getAll();
    const result: AppSettings = { ...DEFAULT_SETTINGS };
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[]) {
      const raw = stored[key];
      if (raw === undefined) continue;
      const defaultValue = DEFAULT_SETTINGS[key];
      if (typeof defaultValue === 'number') {
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) (result[key] as number) = parsed;
      } else if (typeof defaultValue === 'boolean') {
        (result[key] as boolean) = raw === 'true';
      } else {
        (result[key] as string) = raw;
      }
    }
    return result;
  }
}

function serialize(settings: AppSettings): Record<string, string> {
  return Object.fromEntries(
    Object.entries(settings).map(([key, value]) => [key, String(value)]),
  );
}
