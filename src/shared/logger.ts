import pino from 'pino';

/**
 * Mascara um telefone para logs, preservando apenas o começo e o fim.
 * Ex.: "5516999998888" -> "5516*****8888". Retorna string vazia inalterada.
 */
export function maskPhone(phone: string): string {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.length <= 6) return digits.replace(/\d/g, '*');
  const start = digits.slice(0, 4);
  const end = digits.slice(-4);
  return `${start}${'*'.repeat(digits.length - 8)}${end}`;
}

/**
 * Mascara trechos sensíveis em uma string livre: sequências longas de dígitos
 * (telefones) e possíveis tokens/credenciais. Usado como salvaguarda para
 * mensagens de erro que possam conter dados sensíveis.
 */
export function maskSensitive(text: string): string {
  return (
    String(text ?? '')
      // Sequências de 8+ dígitos são tratadas como telefones.
      .replace(/\d{8,}/g, (match) => maskPhone(match))
      // Pares chave/valor que aparentam credenciais.
      .replace(
        /(token|secret|password|senha|apikey|api_key|authorization)\s*[:=]\s*\S+/gi,
        (_m, key: string) => `${key}: [oculto]`,
      )
  );
}

/**
 * Logger estruturado da aplicação. Nível controlado por LOG_LEVEL (default info).
 * Nunca registre conteúdo de mensagens, mídia ou credenciais do Baileys; use os
 * helpers de masking para telefones e mensagens de erro.
 */
// Silencia logs automaticamente sob o test runner do Node (portável, sem depender
// de variável de ambiente inline no npm script), a menos que LOG_LEVEL force outro.
const underTest =
  process.env.NODE_TEST_CONTEXT !== undefined ||
  process.env.NODE_ENV === 'test' ||
  process.argv.some((arg) => arg === '--test' || arg.includes('node:test'));
const defaultLevel = underTest ? 'silent' : 'info';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? defaultLevel,
  redact: {
    paths: ['phone', 'token', 'secret', 'password', 'authorization', '*.token', '*.secret'],
    censor: '[oculto]',
  },
});

export type Logger = typeof logger;
