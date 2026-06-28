#!/usr/bin/env python3
"""Export Rumtime build123d parts to STL and STEP under hardware/cad/out/."""

from __future__ import annotations

import argparse
import importlib
import sys
from collections.abc import Callable
from pathlib import Path

from build123d import Part, export_step, export_stl

# Resolve hardware/cad regardless of cwd (repo root or hardware/cad).
CAD_ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = CAD_ROOT / "out"
SRC_DIR = CAD_ROOT / "src"

if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))


def _load_build(module_name: str, func_name: str = "build") -> Callable[[], Part]:
    module = importlib.import_module(module_name)
    builder = getattr(module, func_name)
    if not callable(builder):
        raise TypeError(f"{module_name}.{func_name} is not callable")
    return builder


PART_SPECS: dict[str, tuple[str, str]] = {
    "kphm100_hole_coupon": ("kphm100_hole_coupon", "build"),
    "kphm100_mount_bracket": ("kphm100_mount_bracket", "build"),
    "load_cell_base": ("load_cell_platform", "build_base"),
    "load_cell_top": ("load_cell_platform", "build_top"),
}


def _resolve_builder(name: str) -> Callable[[], Part]:
    if name not in PART_SPECS:
        known = ", ".join(sorted(PART_SPECS))
        raise SystemExit(f"Unknown part {name!r}. Known parts: {known}")
    module_name, func_name = PART_SPECS[name]
    return _load_build(module_name, func_name)


def export_part(name: str) -> tuple[Path, Path]:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    solid = _resolve_builder(name)()

    stl_path = OUT_DIR / f"{name}.stl"
    step_path = OUT_DIR / f"{name}.step"

    if not export_stl(solid, stl_path):
        raise RuntimeError(f"STL export failed for {name}")
    if not export_step(solid, step_path):
        raise RuntimeError(f"STEP export failed for {name}")

    return stl_path, step_path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Export Rumtime CAD parts to hardware/cad/out/ as STL and STEP.",
    )
    parser.add_argument(
        "part",
        nargs="?",
        help="Part name to export (omit when using --all).",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Export every registered part.",
    )
    args = parser.parse_args(argv)

    if args.all:
        names = sorted(PART_SPECS)
    elif args.part:
        names = [args.part]
    else:
        parser.error("Provide a part name or use --all")

    for name in names:
        stl_path, step_path = export_part(name)
        print(f"Exported {name}:")
        print(f"  {stl_path}")
        print(f"  {step_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
