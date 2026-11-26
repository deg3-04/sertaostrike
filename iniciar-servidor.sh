#!/usr/bin/env sh
# Inicia o servidor do Sertão Strike (Linux / macOS)
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js não encontrado. Instale em https://nodejs.org e tente de novo."
  exit 1
fi
[ -d node_modules/ws ] || npm install --omit=dev
exec node server/index.js "$@"
