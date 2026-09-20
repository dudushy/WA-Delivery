#!/usr/bin/env node
// Launcher amigável: verifica se a porta está livre, inicia a aplicação
// (dist/app.js), espera o health check responder e abre o navegador padrão.
// Sem dependências externas (Node puro). Encerra a aplicação junto com este
// processo (Ctrl+C).
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { platform } from 'node:process';

const HOST = '127.0.0.1';
const PORT = 3000;
const HEALTH_URL = `http://${HOST}:${PORT}/api/health`;
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

function portInUse(port, host) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host });
    socket.setTimeout(1000);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
  });
}

async function waitForHealth(timeoutMs = 30000, intervalMs = 500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(HEALTH_URL);
      if (response.ok) {
        const body = await response.json();
        if (body?.status === 'ok') return true;
      }
    } catch {
      // Ainda subindo; tenta de novo.
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

function openBrowser(url) {
  const command = platform === 'win32' ? 'cmd' : platform === 'darwin' ? 'open' : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    spawn(command, args, { stdio: 'ignore', detached: true }).unref();
  } catch {
    console.log(`Abra manualmente: ${url}`);
  }
}

async function main() {
  if (await portInUse(PORT, HOST)) {
    // Já há algo na porta: provavelmente a aplicação já está rodando.
    if (await waitForHealth(2000, 500)) {
      console.log(
        `A aplicacao ja esta rodando. Abrindo ${HEALTH_URL.replace('/api/health', '')} ...`,
      );
      openBrowser(`http://${HOST}:${PORT}`);
      process.exit(0);
    }
    console.error(`A porta ${PORT} ja esta em uso por outro programa. Feche-o e tente novamente.`);
    process.exit(1);
  }

  const child = spawn(process.execPath, [join(root, 'dist', 'app.js')], {
    cwd: root,
    stdio: 'inherit',
  });

  const shutdown = () => {
    if (!child.killed) child.kill('SIGINT');
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  child.on('exit', (code) => process.exit(code ?? 0));

  if (await waitForHealth()) {
    openBrowser(`http://${HOST}:${PORT}`);
  } else {
    console.error('A aplicacao nao respondeu ao health check a tempo. Verifique os logs acima.');
  }
}

void main();
