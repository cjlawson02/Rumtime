#!/usr/bin/env bash
# Schematic PDF + (when laid out) Gerbers / drill / STEP.
# Usage: export.sh [--fab] [4-pump-module|main-controller ...]
# Default: both projects (PDF/netlist/BOM only).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/out"
mkdir -p "$OUT"

if ! command -v kicad-cli >/dev/null 2>&1; then
  echo "kicad-cli not on PATH." >&2
  exit 1
fi

FAB=0
PROJECTS=()
for arg in "$@"; do
  if [[ "$arg" == "--fab" ]]; then
    FAB=1
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
  echo "==> schematic PDF ($name)"
  kicad-cli sch export pdf --output "$OUT/${name}.pdf" "${proj}.kicad_sch"

  echo "==> netlist ($name)"
  kicad-cli sch export netlist --output "$OUT/${name}.net" "${proj}.kicad_sch"

  echo "==> BOM ($name)"
  kicad-cli sch export bom --output "$OUT/${name}-bom.csv" "${proj}.kicad_sch" || true

  if [[ "$FAB" == "1" ]]; then
    mkdir -p "$OUT/${name}-gerbers"
    echo "==> gerbers + drill ($name)"
    kicad-cli pcb export gerbers --output "$OUT/${name}-gerbers" "${proj}.kicad_pcb"
    kicad-cli pcb export drill --output "$OUT/${name}-gerbers" "${proj}.kicad_pcb"
    kicad-cli pcb export step --output "$OUT/${name}.step" "${proj}.kicad_pcb"
  fi
}

for p in "${PROJECTS[@]}"; do
  run_one "$p"
done

echo "OK — $OUT"
