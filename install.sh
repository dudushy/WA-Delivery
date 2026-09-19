#!/usr/bin/env bash
# WA-Delivery - Instalacao (Linux/WSL)
set -euo pipefail

# Usa o diretorio deste script como raiz (suporta espacos/acentos).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "============================================"
echo "  WA-Delivery - Instalacao"
echo "============================================"

if ! command -v node >/dev/null 2>&1; then
  echo "[ERRO] Node.js nao encontrado. Instale o Node.js LTS: https://nodejs.org/"
  echo "Dica: use nvm (https://github.com/nvm-sh/nvm) e rode 'nvm install' nesta pasta."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[ERRO] npm nao encontrado. Reinstale o Node.js LTS: https://nodejs.org/"
  exit 1
fi

# Valida a versao minima do Node.
node "scripts/check-node.mjs"

echo
echo "Instalando dependencias (npm ci)..."
npm ci

echo
echo "Compilando a aplicacao (build)..."
npm run build

echo
echo "============================================"
echo "  Instalacao concluida com sucesso!"
echo "  Seus dados em data/ foram preservados."
echo "  Agora execute ./run.sh para iniciar."
echo "============================================"
