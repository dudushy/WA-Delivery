import { TimeoutError } from '../../shared/withTimeout.js';

/**
 * Categoria de um erro de envio.
 *
 * - `transient`: falha potencialmente temporária (rede, timeout, socket, conexão).
 *   Elegível para retry em checkpoints posteriores da fila resiliente.
 * - `permanent`: falha que não deve ser repetida (número inválido, mensagem vazia,
 *   mídia ausente, validação de domínio). Repetir não mudaria o resultado.
 */
export type ErrorKind = 'transient' | 'permanent';

/**
 * Marca um erro explicitamente como transitório.
 * Útil quando o provider já sabe que a falha é recuperável.
 */
export class TransientError extends Error {
  public readonly kind: ErrorKind = 'transient';
  public constructor(message: string) {
    super(message);
    this.name = 'TransientError';
  }
}

/**
 * Marca um erro explicitamente como permanente.
 * Útil para validações de domínio que não devem ser repetidas.
 */
export class PermanentError extends Error {
  public readonly kind: ErrorKind = 'permanent';
  public constructor(message: string) {
    super(message);
    this.name = 'PermanentError';
  }
}

// Trechos de mensagem que indicam, com segurança, uma falha permanente de domínio.
const PERMANENT_MESSAGE_PATTERNS: readonly RegExp[] = [
  /não está registrad/i, // número não existe no WhatsApp
  /não pode estar vazia/i, // mensagem vazia
  /não foi encontrada/i, // mídia da campanha ausente
  /não foi encontrado/i,
  /identificador da mensagem/i, // provider não retornou id — payload inválido
];

// Trechos de mensagem que indicam falha transitória (rede/conexão).
const TRANSIENT_MESSAGE_PATTERNS: readonly RegExp[] = [
  /timlimite|tempo limite|timed? out|timeout/i,
  /não está conectado/i, // WhatsApp caiu; recuperável após reconectar
  /connection (closed|lost|reset)/i,
  /socket/i,
  /econnreset|econnrefused|etimedout|enetunreach|ehostunreach|epipe|eai_again/i,
  /network|rede/i,
  /stream errored/i,
];

/**
 * Classifica um erro como transitório ou permanente.
 *
 * Estratégia (em ordem de prioridade):
 * 1. Marcadores explícitos ({@link TransientError} / {@link PermanentError}).
 * 2. {@link TimeoutError} → transitório.
 * 3. Padrões de mensagem permanentes (validação de domínio).
 * 4. Padrões de mensagem transitórios (rede/conexão).
 * 5. Default seguro: `transient`. Um erro desconhecido não deve ser tratado como
 *    permanente silenciosamente; o limite de tentativas (checkpoint posterior)
 *    impede repetição infinita.
 */
export function classifyError(error: unknown): ErrorKind {
  if (error instanceof TransientError) return 'transient';
  if (error instanceof PermanentError) return 'permanent';
  if (error instanceof TimeoutError) return 'transient';

  const message = extractMessage(error);

  if (PERMANENT_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))) {
    return 'permanent';
  }
  if (TRANSIENT_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))) {
    return 'transient';
  }

  return 'transient';
}

function extractMessage(error: unknown): string {
  if (error instanceof Error) {
    // Alguns erros de rede carregam o código em `code` além da mensagem.
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? `${error.message} ${code}` : error.message;
  }
  return String(error);
}
