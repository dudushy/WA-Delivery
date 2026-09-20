/**
 * Erro lançado quando uma operação excede o tempo limite configurado.
 * Usado para diferenciar um timeout de outras falhas na classificação de erros.
 */
export class TimeoutError extends Error {
  public constructor(message = 'A operação excedeu o tempo limite.') {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Executa uma Promise com um tempo limite.
 *
 * - Se a Promise resolver antes do prazo, o resultado é repassado e o timer é limpo.
 * - Se a Promise rejeitar antes do prazo, a rejeição original é propagada e o timer é limpo.
 * - Se o prazo estourar primeiro, rejeita com {@link TimeoutError}.
 *
 * O timer nunca segura o event loop ativo (usa `unref` quando disponível), evitando
 * que um timeout pendente impeça o encerramento do processo.
 *
 * @param operation Promise (ou factory de Promise) a ser aguardada.
 * @param timeoutMs Tempo limite em milissegundos. Valores <= 0 desativam o timeout.
 * @param message Mensagem opcional para o TimeoutError.
 */
export async function withTimeout<T>(
  operation: Promise<T> | (() => Promise<T>),
  timeoutMs: number,
  message?: string,
): Promise<T> {
  const promise = typeof operation === 'function' ? operation() : operation;

  // Timeout desativado: apenas aguarda a operação original.
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;

  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(message)), timeoutMs);
    // Não impede o encerramento do processo caso a operação nunca resolva.
    timer.unref?.();
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
