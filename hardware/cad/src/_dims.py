"""Shared dimensions copied from hardware/cad/refs — update refs first, then mirror here."""

from __future__ import annotations

from typing import NamedTuple

# --- KPHM100 mount plate (refs/kphm100-mount-plate.md) ---

PLATE_T_MM = 7.0  # ref: refs/kphm100-mount-plate.md — mounting bracket / plate thickness
CLEARANCE_D_MM = 32.0  # ref: refs/kphm100-mount-plate.md — central pump body / clearance circle
HOLE_D_MM = 3.3  # ref: refs/kphm100-mount-plate.md — close M3 clearance holes


class HoleCenter(NamedTuple):
    x: float
    y: float
    role: str


# Drawing/front-view coordinates; ref: refs/kphm100-mount-plate.md.
KPHM100_DRAWING_HOLE_CENTERS: tuple[HoleCenter, ...] = (
    HoleCenter(-15.5, 15.5, "top-left"),
    HoleCenter(17.5, 8.5, "top-right"),
    HoleCenter(-17.5, -8.5, "bottom-left"),
    HoleCenter(15.5, -15.5, "bottom-right"),
)

# Custom interfaces are viewed from the motor side, so mirror drawing X.
KPHM100_MOTOR_SIDE_HOLE_CENTERS: tuple[HoleCenter, ...] = (
    HoleCenter(15.5, 15.5, "top-right"),
    HoleCenter(-17.5, 8.5, "top-left"),
    HoleCenter(17.5, -8.5, "bottom-right"),
    HoleCenter(-15.5, -15.5, "bottom-left"),
)

# Backwards-compatible drawing-view alias.
KPHM100_HOLE_CENTERS = KPHM100_DRAWING_HOLE_CENTERS

# Aliases used by pump / front-plate modules.
KPHM100_PLATE_T_MM = PLATE_T_MM
KPHM100_CLEARANCE_D_MM = CLEARANCE_D_MM
KPHM100_MOUNT_HOLE_D_MM = HOLE_D_MM
KPHM100_MOUNT_HOLE_CENTERS_MM: tuple[tuple[float, float], ...] = tuple(
    (hole.x, hole.y) for hole in KPHM100_MOTOR_SIDE_HOLE_CENTERS
)

# --- Estardyn 5 kg load cell bar (refs/estardyn-load-cell.md) ---
# x = 0 at load / arrow end; +X toward wire / fixed end. Do not symmetrize hole Xs.

BAR_LENGTH_MM = 75.0  # ref: refs/estardyn-load-cell.md — measured overall length
BAR_WIDTH_MM = 12.75  # ref: refs/estardyn-load-cell.md — measured width
BAR_HEIGHT_MM = 12.75  # ref: refs/estardyn-load-cell.md — measured height
BAR_HOLE_D_MM = 3.5  # ref: refs/estardyn-load-cell.md — measured M4 tap minor diameter
BAR_PLATE_HOLE_D_MM = 4.4  # ref: refs/estardyn-load-cell.md — M4 clearance in printed plates


class LoadCellHole(NamedTuple):
    x: float
    role: str
    end: str


# Hole centers on the width centerline (Y = 0); through +Z.
LOAD_CELL_HOLE_CENTERS: tuple[LoadCellHole, ...] = (
    LoadCellHole(5.0, "load-outer", "load"),
    LoadCellHole(15.0, "load-inner", "load"),
    LoadCellHole(59.0, "fixed-inner", "fixed"),
    LoadCellHole(69.0, "fixed-outer", "fixed"),
)
LOAD_CELL_LOAD_HOLE_XS: tuple[float, ...] = tuple(
    hole.x for hole in LOAD_CELL_HOLE_CENTERS if hole.end == "load"
)
LOAD_CELL_FIXED_HOLE_XS: tuple[float, ...] = tuple(
    hole.x for hole in LOAD_CELL_HOLE_CENTERS if hole.end == "fixed"
)
