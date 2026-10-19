#!/usr/bin/env bash
# Mirror .github/workflows/ui-kiosk.yml for local / pre-commit use.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root/ui/kiosk"

if [[ ! -d node_modules ]]; then
  npm ci
fi

npm run lint
npm run format:check
npm run test
VITE_SETUP_PIN="${VITE_SETUP_PIN:-0000}" npm run build
