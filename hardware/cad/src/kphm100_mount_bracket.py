"""KPHM100 pump mount bracket.

7 mm plate with M3 clearance holes and central pump-body clearance.
Origin at plate center; +X right, +Y up (top view). ref: refs/kphm100-mount-plate.md
"""

from __future__ import annotations

from build123d import (
    BuildPart,
    BuildSketch,
    Cylinder,
    Hole,
    Locations,
    Mode,
    Part,
    RectangleRounded,
    extrude,
)

try:
    from ._dims import (
        KPHM100_CLEARANCE_D_MM as CLEARANCE_D_MM,
        KPHM100_MOUNT_HOLE_CENTERS_MM as MOUNT_HOLE_CENTERS_MM,
        KPHM100_MOUNT_HOLE_D_MM as MOUNT_HOLE_D_MM,
        KPHM100_PLATE_T_MM as PLATE_T,
    )
except ImportError:
    # ref: refs/kphm100-mount-plate.md — do not symmetrize
    MOUNT_HOLE_D_MM = 3.5
    CLEARANCE_D_MM = 33.0
    PLATE_T = 7.0  # drawing-derived; verify on physical unit
    MOUNT_HOLE_CENTERS_MM = (
        (-15.5, 15.5),  # top-left
        (17.5, 8.5),  # top-right
        (-17.5, -8.5),  # bottom-left
        (15.5, -15.5),  # bottom-right
    )

FLANGE_MARGIN_MM = 8.0
CORNER_RADIUS_MM = 3.0


def _plate_xy_size(margin_mm: float) -> tuple[float, float]:
    xs = [x for x, _ in MOUNT_HOLE_CENTERS_MM]
    ys = [y for _, y in MOUNT_HOLE_CENTERS_MM]
    return (max(xs) - min(xs)) + 2 * margin_mm, (max(ys) - min(ys)) + 2 * margin_mm


def build() -> Part:
    width, height = _plate_xy_size(FLANGE_MARGIN_MM)

    with BuildPart() as bracket:
        with BuildSketch() as plate_sketch:
            RectangleRounded(width, height, CORNER_RADIUS_MM)
        extrude(amount=PLATE_T / 2, both=True)

        with Locations(*[(x, y, 0) for x, y in MOUNT_HOLE_CENTERS_MM]):
            Hole(radius=MOUNT_HOLE_D_MM / 2, depth=PLATE_T + 1)

        Cylinder(
            radius=CLEARANCE_D_MM / 2,
            height=PLATE_T + 1,
            mode=Mode.SUBTRACT,
        )

    return bracket.part
