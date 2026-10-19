#!/usr/bin/env bash
# Mirror firmware jobs in .github/workflows/ci.yml for local / pre-commit use.
# Usage: check-firmware.sh [bench-rig|controller|all]
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
target="${1:-all}"

build_one() {
  local dir="$1"
  echo "==> Building firmware/${dir}"
  (cd "$root/firmware/${dir}" && pio run -e esp32-s3-devkitc-1)
}

test_controller() {
  # Host native tests need a working local libc++ link. Current macOS CLT SDKs
  # can fail with arm64e.x1 TBD errors; GitHub Actions (Linux) still runs them.
  if [[ "$(uname -s)" == Darwin ]]; then
    echo "==> Skipping native tests on macOS (run on Linux / CI)"
    return 0
  fi
  echo "==> Native tests firmware/controller"
  (cd "$root/firmware/controller" && pio test -e native)
}

case "$target" in
  bench-rig)
    build_one bench-rig
    ;;
  controller)
    build_one controller
    test_controller
    ;;
  all)
    build_one bench-rig
    build_one controller
    test_controller
    ;;
  *)
    echo "usage: $0 [bench-rig|controller|all]" >&2
    exit 2
    ;;
esac
