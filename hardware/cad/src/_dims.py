"""Shared dimensions copied from hardware/cad/refs — update refs first, then mirror here."""

from __future__ import annotations

from typing import NamedTuple

# --- KPHM100 mount plate (refs/kphm100-mount-plate.md) ---

PLATE_T_MM = 7.0  # ref: refs/kphm100-mount-plate.md — mounting bracket / plate thickness
CLEARANCE_D_MM = 33.0  # ref: refs/kphm100-mount-plate.md — central pump body / clearance circle
HOLE_D_MM = 3.5  # ref: refs/kphm100-mount-plate.md — M3 clearance holes


class HoleCenter(NamedTuple):
    x: float
    y: float
    role: str


# ref: refs/kphm100-mount-plate.md — asymmetric pattern; do not symmetrize
KPHM100_HOLE_CENTERS: tuple[HoleCenter, ...] = (
    HoleCenter(-15.5, 15.5, "top-left"),
    HoleCenter(17.5, 8.5, "top-right"),
    HoleCenter(-17.5, -8.5, "bottom-left"),
    HoleCenter(15.5, -15.5, "bottom-right"),
)

# Aliases used by part modules (same values as above)
KPHM100_PLATE_T_MM = PLATE_T_MM
KPHM100_CLEARANCE_D_MM = CLEARANCE_D_MM
KPHM100_MOUNT_HOLE_D_MM = HOLE_D_MM
KPHM100_MOUNT_HOLE_CENTERS_MM: tuple[tuple[float, float], ...] = tuple(
    (h.x, h.y) for h in KPHM100_HOLE_CENTERS
)

# --- Estardyn 5 kg load cell bar (refs/estardyn-load-cell.md) ---

BAR_LENGTH_MM = 80.0  # ref: refs/estardyn-load-cell.md — overall bar length (some batches 75 mm)
BAR_WIDTH_MM = 12.7  # ref: refs/estardyn-load-cell.md — cross-section width
BAR_HEIGHT_MM = 12.7  # ref: refs/estardyn-load-cell.md — cross-section height
HOLE_PAIR_SPACING_MM = 15.0  # ref: refs/estardyn-load-cell.md — center-to-center per end pair
