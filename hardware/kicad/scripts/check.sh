#!/usr/bin/env bash
# ERC (and DRC once the board has an outline) via kicad-cli.
# Usage: check.sh [--drc] [4-pump-module|main-controller ...]
# Default: both projects (ERC only).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/out"
mkdir -p "$OUT"

if ! command -v kicad-cli >/dev/null 2>&1; then
  echo "kicad-cli not on PATH. On this machine: /opt/homebrew/bin/kicad-cli" >&2
  exit 1
fi

DRC=0
PROJECTS=()
for arg in "$@"; do
  if [[ "$arg" == "--drc" ]]; then
    DRC=1
  else
    PROJECTS+=("$arg")
  fi
done
if [[ ${#PROJECTS[@]} -eq 0 ]]; then
  PROJECTS=(4-pump-module main-controller)
fi

run_one() {
  local name="$1"
  local proj="$ROOT/$name/$name"
  echo "==> ERC ${proj}.kicad_sch"
  kicad-cli sch erc \
    --output "$OUT/${name}-erc.report" \
    --format report \
    --severity-all \
    --exit-code-violations \
    "${proj}.kicad_sch"

  if [[ "$DRC" == "1" ]]; then
    echo "==> DRC ${proj}.kicad_pcb"
    kicad-cli pcb drc \
      --output "$OUT/${name}-drc.report" \
      --format report \
      --schematic-parity \
      --severity-all \
      --exit-code-violations \
      "${proj}.kicad_pcb"
  fi
}

for p in "${PROJECTS[@]}"; do
  run_one "$p"
done

echo "OK — reports in $OUT"
