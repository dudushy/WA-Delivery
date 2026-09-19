/**
 * Lógica portável de instalação/execução, extraída dos scripts .bat/.sh para
 * ser testável. Sem efeitos colaterais: apenas funções puras de parsing e
 * decisão. Os scripts de shell consomem estas funções via `node`.
 */

export interface NodeVersionCheck {
  ok: boolean;
  current: string;
  required: string;
  message: string;
}

/**
 * Faz o parsing de uma string de versão semver simples (ex.: "v24.14.0" ou
 * "24.14") em [major, minor, patch]. Partes ausentes viram 0. Retorna undefined
 * quando não há um número de versão reconhecível.
 */
export function parseVersion(raw: string): [number, number, number] | undefined {
  const match = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(String(raw ?? ''));
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
}

/** Compara duas versões semver. Retorna -1, 0 ou 1. */
export function compareVersions(a: [number, number, number], b: [number, number, number]): number {
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

/**
 * Verifica se a versão atual do Node atende à mínima exigida.
 * `currentRaw` costuma ser `process.version`; `requiredRaw` vem do `.nvmrc`
 * ou de um default.
 */
export function checkNodeVersion(currentRaw: string, requiredRaw: string): NodeVersionCheck {
  const current = parseVersion(currentRaw);
  const required = parseVersion(requiredRaw) ?? [24, 14, 0];
  const requiredStr = required.join('.');

  if (!current) {
    return {
      ok: false,
      current: String(currentRaw ?? ''),
      required: requiredStr,
      message: `Não foi possível identificar a versão do Node.js. Instale o Node.js ${requiredStr} ou superior (LTS): https://nodejs.org/`,
    };
  }

  const ok = compareVersions(current, required) >= 0;
  return {
    ok,
    current: current.join('.'),
    required: requiredStr,
    message: ok
      ? `Node.js ${current.join('.')} atende ao mínimo (${requiredStr}).`
      : `Node.js ${current.join('.')} é muito antigo. Instale a versão ${requiredStr} ou superior (LTS): https://nodejs.org/`,
  };
}

/**
 * Interpreta o corpo de resposta do health check. Aceita o formato atual
 * (`{ "status": "ok" }`). Retorna true somente quando saudável.
 */
export function isHealthy(body: string): boolean {
  try {
    const parsed = JSON.parse(body);
    return parsed?.status === 'ok';
  } catch {
    return false;
  }
}

/**
 * Extrai a versão mínima de Node a partir do conteúdo de um `.nvmrc`.
 * Default seguro quando ausente/ inválido.
 */
export function requiredNodeFromNvmrc(nvmrc: string | undefined, fallback = '24.14.0'): string {
  const parsed = parseVersion(nvmrc ?? '');
  return parsed ? parsed.join('.') : fallback;
}
