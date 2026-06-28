"""Cantilever load-cell platform plates (Estardyn 5 kg / 611N-class bar).

Geometry follows hardware/cad/refs/estardyn-load-cell.md — vendor-typical hole
positions; caliper the physical cell on receipt before locking tooling.
"""

from __future__ import annotations

from build123d import Align, BuildPart, Box, Cylinder, Locations, Mode, Part

try:
    from ._dims import BAR_LENGTH_MM, BAR_WIDTH_MM, HOLE_PAIR_SPACING_MM
except ImportError:
    BAR_LENGTH_MM = 80.0
    BAR_WIDTH_MM = 12.7
    HOLE_PAIR_SPACING_MM = 15.0

# ref: refs/estardyn-load-cell.md — ~5 mm in from each end along bar axis (vendor-typical)
HOLE_INSET_FROM_END_MM = 5  # verify on receipt

# ref: refs/estardyn-load-cell.md — M4 fixed / M5 load
M4_CLEARANCE_D_MM = 4.4
M5_CLEARANCE_D_MM = 5.5

# ref: refs/estardyn-load-cell.md — ~100–120 mm glass envelope
TOP_OD_MM = 110
GLASS_OVERHANG_MM = 22.5  # shifts top-plate center toward free end for glass clearance

FLANGE_MARGIN_MM = 8  # ref: README — min 5 mm beyond outermost holes
BASE_PLATE_T_MM = 6
TOP_PLATE_T_MM = 5

# Assembly frame (documented for mating; each part has its own origin):
#   +X along bar from fixed end (x=0) toward load end (x=BAR_LENGTH_MM).
#   +Y across bar width; +Z up (plate thickness).
# Fixed-end hole centers (vendor-typical; verify on receipt):
#   (HOLE_INSET_FROM_END_MM, 0), (HOLE_INSET_FROM_END_MM + HOLE_PAIR_SPACING_MM, 0)
# Load-end hole centers (vendor-typical; verify on receipt):
#   (BAR_LENGTH_MM - HOLE_INSET_FROM_END_MM - HOLE_PAIR_SPACING_MM, 0),
#   (BAR_LENGTH_MM - HOLE_INSET_FROM_END_MM, 0)


def _fixed_end_hole_xs() -> tuple[float, float]:
    near = HOLE_INSET_FROM_END_MM
    far = HOLE_INSET_FROM_END_MM + HOLE_PAIR_SPACING_MM
    return near, far


def _load_end_hole_xs() -> tuple[float, float]:
    near = BAR_LENGTH_MM - HOLE_INSET_FROM_END_MM - HOLE_PAIR_SPACING_MM
    far = BAR_LENGTH_MM - HOLE_INSET_FROM_END_MM
    return near, far


def build_base() -> Part:
    """Rigid fixed-end plate with M4 clearance holes on 15 mm centers."""
    hole_x_near, hole_x_far = _fixed_end_hole_xs()

    # Origin at plate center; fixed end of bar toward -X.
    x_min = -FLANGE_MARGIN_MM
    x_max = hole_x_far + FLANGE_MARGIN_MM
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
            (hole_x_near - x_center, 0, 0),
            (hole_x_far - x_center, 0, 0),
        ):
            Cylinder(
                radius=M4_CLEARANCE_D_MM / 2,
                height=BASE_PLATE_T_MM,
                mode=Mode.SUBTRACT,
            )

    return plate.part


def build_top() -> Part:
    """Floating glass platform with M5 clearance holes on 15 mm centers."""
    hole_x_near, hole_x_far = _load_end_hole_xs()
    hole_centroid_x = (hole_x_near + hole_x_far) / 2
    plate_center_x = hole_centroid_x + GLASS_OVERHANG_MM

    hole_local_near = hole_x_near - plate_center_x
    hole_local_far = hole_x_far - plate_center_x

    with BuildPart() as plate:
        Cylinder(radius=TOP_OD_MM / 2, height=TOP_PLATE_T_MM, align=(Align.CENTER, Align.CENTER, Align.MIN))
        with Locations(
            (hole_local_near, 0, 0),
            (hole_local_far, 0, 0),
        ):
            Cylinder(
                radius=M5_CLEARANCE_D_MM / 2,
                height=TOP_PLATE_T_MM,
                mode=Mode.SUBTRACT,
            )

    return plate.part
