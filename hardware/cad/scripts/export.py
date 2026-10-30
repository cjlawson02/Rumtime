#!/usr/bin/env python3
"""Export Rumtime build123d parts to STL and STEP under hardware/cad/out/."""

from __future__ import annotations

import argparse
import importlib
import sys
from collections.abc import Callable
from pathlib import Path

from build123d import Shape, export_step, export_stl

# Resolve hardware/cad regardless of cwd (repo root or hardware/cad).
CAD_ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = CAD_ROOT / "out"
SRC_DIR = CAD_ROOT / "src"

if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))


def _load_build(module_name: str, func_name: str = "build") -> Callable[[], Shape]:
    module = importlib.import_module(module_name)
    builder = getattr(module, func_name)
    if not callable(builder):
        raise TypeError(f"{module_name}.{func_name} is not callable")
    return builder


PART_SPECS: dict[str, tuple[str, str]] = {
    "kphm100_pump": ("kphm100_pump", "build"),
    "load_cell_bar": ("load_cell_bar", "build"),
    "load_cell_base": ("load_cell_platform", "build_base"),
    "load_cell_top": ("load_cell_platform", "build_top"),
    "load_cell_fixed_cleat": ("load_cell_bench", "build_fixed_cleat"),
    "load_cell_load_pad": ("load_cell_bench", "build_load_pad"),
    "load_cell_bench_pin": ("load_cell_bench", "build_bench_pin"),
    "load_cell_bench_pin_set": ("load_cell_bench", "build_bench_pin_set"),
    "four_pump_block_body": ("four_pump_block", "build_body"),
    "four_pump_block_front_plate": ("four_pump_block", "build_front_plate"),
    "four_pump_block_front_plate_print": (
        "four_pump_block",
        "build_front_plate_print",
    ),
    "four_pump_block_top_tube_panel": (
        "four_pump_block",
        "build_top_tube_panel",
    ),
    "four_pump_block_top_tube_panel_print": (
        "four_pump_block",
        "build_top_tube_panel_print",
    ),
    "four_pump_block_pcb_rear": ("four_pump_block", "build_pcb_envelope_rear"),
    "four_pump_block_clearance_rear": ("four_pump_block", "build_clearance_rear"),
    "four_pump_block_clearance_rear_top_off": (
        "four_pump_block",
        "build_clearance_rear_top_off",
    ),
    "four_pump_block_mount_coupon": (
        "four_pump_block_coupons",
        "build_mount_coupon",
    ),
    "four_pump_block_tube_clamp_coupon": (
        "four_pump_block_coupons",
        "build_tube_clamp_coupon",
    ),
    "four_pump_block_front_channel_coupon": (
        "four_pump_block_coupons",
        "build_front_channel_coupon",
    ),
    "tube_bundle_clamp": ("tube_bundle_clamp", "build_clamp"),
    "tube_bundle_clamp_print": ("tube_bundle_clamp", "build_clamp_print"),
}


def _resolve_builder(name: str) -> Callable[[], Shape]:
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
