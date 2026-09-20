#!/usr/bin/env node
// Verificação de versão do Node executável ANTES de `npm ci` (sem dependências,
// sem tsx). A lógica canônica e testada vive em scripts/setupLib.ts; este arquivo
// replica apenas o mínimo para rodar com Node puro.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function parseVersion(raw) {
  const match = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(String(raw ?? ''));
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
}

function compare(a, b) {
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}

const here = dirname(fileURLToPath(import.meta.url));
let required = [24, 14, 0];
try {
  const nvmrc = readFileSync(join(here, '..', '.nvmrc'), 'utf8');
  required = parseVersion(nvmrc) ?? required;
} catch {
  // Sem .nvmrc: usa o default.
}

const current = parseVersion(process.version);
const requiredStr = required.join('.');
if (!current) {
  console.error(
    `Nao foi possivel identificar a versao do Node.js. Instale o Node.js ${requiredStr}+ (LTS): https://nodejs.org/`,
  );
  process.exit(1);
}
if (compare(current, required) < 0) {
  console.error(
    `Node.js ${current.join('.')} e muito antigo. Instale a versao ${requiredStr}+ (LTS): https://nodejs.org/`,
  );
  process.exit(1);
}
console.log(`Node.js ${current.join('.')} OK (minimo ${requiredStr}).`);
process.exit(0);
