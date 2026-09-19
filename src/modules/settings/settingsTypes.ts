/**
 * Configurações operacionais persistentes da aplicação.
 *
 * Todos os campos possuem defaults seguros; a UI edita este objeto por completo,
 * e o backend valida cada campo antes de persistir. Nenhuma configuração exige
 * edição manual de JSON ou `.env`.
 */
export interface AppSettings {
  /** Código do país padrão (somente dígitos) aplicado na normalização de telefones. */
  defaultCountryCode: string;
  /** DDD padrão opcional (somente dígitos) prefixado a números locais sem DDD. */
  defaultAreaCode: string;
  /** Tempo limite de cada operação do provider, em milissegundos. */
  operationTimeoutMs: number;
  /** Número máximo de tentativas por destinatário para falhas transitórias. */
  maxAttempts: number;
  /** Base do backoff exponencial entre tentativas transitórias, em milissegundos. */
  retryBackoffMs: number;
  /** Teto do backoff entre tentativas, em milissegundos. */
  retryBackoffCapMs: number;
  /** Dias de retenção de campanhas finalizadas para limpeza (0 = nunca limpar). */
  retentionDays: number;
  /** Preferência de efeitos sonoros na interface. */
  soundEnabled: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  defaultCountryCode: '55',
  defaultAreaCode: '',
  operationTimeoutMs: 30_000,
  maxAttempts: 3,
  retryBackoffMs: 1_000,
  retryBackoffCapMs: 30_000,
  retentionDays: 0,
  soundEnabled: true,
};

export interface SettingsValidationIssue {
  path: string;
  message: string;
}

export class SettingsValidationError extends Error {
  public constructor(public readonly issues: SettingsValidationIssue[]) {
    super('As configurações são inválidas.');
    this.name = 'SettingsValidationError';
  }
}
