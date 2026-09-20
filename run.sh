#!/usr/bin/env bash
# WA-Delivery - Execucao (Linux/WSL)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "============================================"
echo "  WA-Delivery - Iniciando"
echo "============================================"

if ! command -v node >/dev/null 2>&1; then
  echo "[ERRO] Node.js nao encontrado. Instale o Node.js LTS e rode ./run.sh novamente."
  exit 1
fi

node "scripts/check-node.mjs"

if [ ! -d node_modules ]; then
  echo "Dependencias ausentes. Instalando (npm ci)..."
  npm ci
fi

if [ ! -f dist/app.js ]; then
  echo "Build ausente. Compilando..."
  npm run build
fi

echo
echo "Iniciando a aplicacao e abrindo o navegador..."
echo "Pressione Ctrl+C para encerrar."
echo
# No WSL, xdg-open pode abrir o navegador do Windows se configurado; caso
# contrario, acesse http://localhost:3000 manualmente no navegador do Windows.
exec node "scripts/start.mjs"
