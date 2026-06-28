"""KPHM100 mount hole-pattern fit coupon.

Thin plate for verifying asymmetric hole alignment on the pump face.
Origin at plate center; +X right, +Y up (top view). ref: refs/kphm100-mount-plate.md
"""

from __future__ import annotations

from typing import Literal

from build123d import (
    Align,
    Box,
    BuildPart,
    BuildSketch,
    Circle,
    Cylinder,
    Hole,
    Locations,
    Mode,
    Part,
    Plane,
    extrude,
)

try:
    from ._dims import (
        KPHM100_CLEARANCE_D_MM as CLEARANCE_D_MM,
        KPHM100_MOUNT_HOLE_CENTERS_MM as MOUNT_HOLE_CENTERS_MM,
        KPHM100_MOUNT_HOLE_D_MM as MOUNT_HOLE_D_MM,
    )
except ImportError:
    # ref: refs/kphm100-mount-plate.md — do not symmetrize
    MOUNT_HOLE_D_MM = 3.5
    CLEARANCE_D_MM = 33.0
    MOUNT_HOLE_CENTERS_MM = (
        (-15.5, 15.5),  # top-left
        (17.5, 8.5),  # top-right
        (-17.5, -8.5),  # bottom-left
        (15.5, -15.5),  # bottom-right
    )

HOLE_COUPON_T = 2.0
HOLE_COUPON_MARGIN_MM = 8.0
CENTER_FEATURE: Literal["cut", "ring", "none"] = "cut"
CENTER_RING_HEIGHT_MM = 0.4
CENTER_RING_WIDTH_MM = 0.6


def _plate_xy_size(margin_mm: float) -> tuple[float, float]:
    xs = [x for x, _ in MOUNT_HOLE_CENTERS_MM]
    ys = [y for _, y in MOUNT_HOLE_CENTERS_MM]
    return (max(xs) - min(xs)) + 2 * margin_mm, (max(ys) - min(ys)) + 2 * margin_mm


def build() -> Part:
    width, height = _plate_xy_size(HOLE_COUPON_MARGIN_MM)
    thickness = HOLE_COUPON_T

    with BuildPart() as coupon:
        Box(
            width,
            height,
            thickness,
            align=(Align.CENTER, Align.CENTER, Align.CENTER),
        )

        with Locations(*[(x, y, 0) for x, y in MOUNT_HOLE_CENTERS_MM]):
            Hole(radius=MOUNT_HOLE_D_MM / 2, depth=thickness + 1)

        if CENTER_FEATURE == "cut":
            Cylinder(
                radius=CLEARANCE_D_MM / 2,
                height=thickness + 1,
                align=(Align.CENTER, Align.CENTER, Align.CENTER),
                mode=Mode.SUBTRACT,
            )
        elif CENTER_FEATURE == "ring":
            outer_r = CLEARANCE_D_MM / 2
            inner_r = outer_r - CENTER_RING_WIDTH_MM
            ring_z = thickness / 2 - CENTER_RING_HEIGHT_MM / 2
            with BuildSketch(Plane.XY.offset(ring_z)) as ring_sketch:
                Circle(outer_r)
                Circle(inner_r, mode=Mode.SUBTRACT)
            extrude(amount=CENTER_RING_HEIGHT_MM)

    return coupon.part
