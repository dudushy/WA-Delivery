import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

/**
 * Detecta parênteses não escapados em linhas `echo` dentro de um bloco
 * parentetizado de `if (...)` num arquivo .bat. Esse é exatamente o padrão que
 * quebrava o RUN.bat: `echo ... (npm ci)...` dentro de `if not exist "x" (`,
 * onde o `)` da mensagem é interpretado pelo cmd.exe como fim do bloco `if`,
 * produzindo `... was unexpected at this time.`
 *
 * Regra pragmática: rastreamos a profundidade de blocos parentetizados abertos
 * por linhas terminadas em `(` (ex.: `if ... (`). Enquanto a profundidade > 0,
 * qualquer linha `echo` que contenha `(` ou `)` NÃO escapado (sem `^` antes) é
 * uma regressão.
 */
function findUnescapedParensInIfBlocks(content: string): string[] {
  const offending: string[] = [];
  let depth = 0;
  const lines = content.split(/\r?\n/);

  for (const raw of lines) {
    const line = raw.trim();
    if (line.length === 0) continue;

    // Se estamos dentro de um bloco if(...) e a linha é um echo, valida os parênteses.
    if (depth > 0 && /^echo\b/i.test(line)) {
      // Remove parênteses escapados (^() antes de checar.
      const unescaped = line.replace(/\^[()]/g, '');
      if (/[()]/.test(unescaped)) {
        offending.push(raw);
      }
    }

    // Atualiza a profundidade de blocos. Uma linha que abre bloco termina em `(`.
    if (/\($/.test(line)) {
      depth += 1;
    } else if (/^\)/.test(line)) {
      // Linha que fecha o bloco (ex.: `)` sozinho).
      depth = Math.max(0, depth - 1);
    }
  }

  return offending;
}

describe('scripts de launcher (.bat)', () => {
  it('RUN.bat não tem parênteses não escapados em echo dentro de if(...)', () => {
    const runBat = join(root, 'RUN.bat');
    assert.ok(existsSync(runBat), 'RUN.bat deve existir');
    const content = readFileSync(runBat, 'utf8');
    const offending = findUnescapedParensInIfBlocks(content);
    assert.deepEqual(
      offending,
      [],
      `Parênteses não escapados dentro de bloco if(...) quebram o cmd.exe ` +
        `("... was unexpected at this time."). Linhas problemáticas:\n${offending.join('\n')}`,
    );
  });

  it('o detector reconhece o padrão que quebrava o RUN.bat', () => {
    const bad = ['if not exist "node_modules" (', '  echo Instalando agora (npm ci)...', ')'].join(
      '\n',
    );
    assert.equal(findUnescapedParensInIfBlocks(bad).length, 1);

    const good = [
      'if not exist "node_modules" (',
      '  echo Instalando agora com npm ci...',
      ')',
    ].join('\n');
    assert.equal(findUnescapedParensInIfBlocks(good).length, 0);

    // Parênteses em nível superior (fora de bloco if) são inofensivos.
    const topLevel = 'echo Instalando dependencias (npm ci)...';
    assert.equal(findUnescapedParensInIfBlocks(topLevel).length, 0);

    // Parênteses escapados dentro do bloco são aceitos.
    const escaped = ['if not exist "x" (', '  echo Instalando ^(npm ci^)...', ')'].join('\n');
    assert.equal(findUnescapedParensInIfBlocks(escaped).length, 0);
  });
});
