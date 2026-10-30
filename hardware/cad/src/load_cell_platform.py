"""Cantilever load-cell platform plates (measured Estardyn 5 kg bar).

Hole centers from hardware/cad/refs/estardyn-load-cell.md. Later product
plates — print the bench cleat/pad first.

ref: refs/estardyn-load-cell.md
"""

from __future__ import annotations

from build123d import Align, BuildPart, Box, Cylinder, Locations, Mode, Part

try:
    from ._dims import (
        BAR_LENGTH_MM,
        BAR_PLATE_HOLE_D_MM,
        BAR_WIDTH_MM,
        LOAD_CELL_FIXED_HOLE_XS,
        LOAD_CELL_LOAD_HOLE_XS,
    )
except ImportError:
    from _dims import (
        BAR_LENGTH_MM,
        BAR_PLATE_HOLE_D_MM,
        BAR_WIDTH_MM,
        LOAD_CELL_FIXED_HOLE_XS,
        LOAD_CELL_LOAD_HOLE_XS,
    )

# ref: refs/estardyn-load-cell.md — ~100–120 mm glass envelope
TOP_OD_MM = 110
GLASS_OVERHANG_MM = 22.5  # shifts top-plate center toward free end for glass clearance

FLANGE_MARGIN_MM = 8  # ref: README — min 5 mm beyond outermost holes
BASE_PLATE_T_MM = 6
TOP_PLATE_T_MM = 5

# Local +X on the base plate starts at the wire-end face of the bar.
_FIXED_XS_FROM_WIRE_END = tuple(
    BAR_LENGTH_MM - x for x in reversed(LOAD_CELL_FIXED_HOLE_XS)
)


def build_base() -> Part:
    """Rigid fixed / wire-end plate with M4 clearance holes."""
    hole_near, hole_far = _FIXED_XS_FROM_WIRE_END
    x_min = -FLANGE_MARGIN_MM
    x_max = hole_far + FLANGE_MARGIN_MM
    plate_len = x_max - x_min
    plate_wid = BAR_WIDTH_MM + 2 * FLANGE_MARGIN_MM
    x_center = (x_min + x_max) / 2

    with BuildPart() as plate:
        Box(
            plate_len,
            plate_wid,
            BASE_PLATE_T_MM,
            align=(Align.CENTER, Align.CENTER, Align.MIN),
        )
        with Locations(
            (hole_near - x_center, 0, 0),
            (hole_far - x_center, 0, 0),
        ):
            Cylinder(
                radius=BAR_PLATE_HOLE_D_MM / 2,
                height=BASE_PLATE_T_MM,
                mode=Mode.SUBTRACT,
            )

    return plate.part


def build_top() -> Part:
    """Floating glass platform with M4 clearance holes at the load end."""
    hole_near, hole_far = LOAD_CELL_LOAD_HOLE_XS
    hole_centroid_x = (hole_near + hole_far) / 2
    plate_center_x = hole_centroid_x + GLASS_OVERHANG_MM

    with BuildPart() as plate:
        Cylinder(
            radius=TOP_OD_MM / 2,
            height=TOP_PLATE_T_MM,
            align=(Align.CENTER, Align.CENTER, Align.MIN),
        )
        with Locations(
            (hole_near - plate_center_x, 0, 0),
            (hole_far - plate_center_x, 0, 0),
        ):
            Cylinder(
                radius=BAR_PLATE_HOLE_D_MM / 2,
                height=TOP_PLATE_T_MM,
                mode=Mode.SUBTRACT,
            )

    return plate.part
