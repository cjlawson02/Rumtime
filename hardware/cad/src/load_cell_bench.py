"""Bench-simple load-cell cantilever (measured Estardyn 5 kg bar).

Two small FDM parts — not the 110 mm product platform. Wire/fixed end in
the U-cleat, arrow/load end in the pad groove.

ref: refs/estardyn-load-cell.md
"""

from __future__ import annotations

from build123d import Align, Box, BuildPart, Cone, Cylinder, Locations, Mode, Part

try:
    from ._dims import (
        BAR_HEIGHT_MM,
        BAR_LENGTH_MM,
        BAR_PLATE_HOLE_D_MM,
        BAR_WIDTH_MM,
        LOAD_CELL_FIXED_HOLE_XS,
        LOAD_CELL_LOAD_HOLE_XS,
    )
except ImportError:
    from _dims import (
        BAR_HEIGHT_MM,
        BAR_LENGTH_MM,
        BAR_PLATE_HOLE_D_MM,
        BAR_WIDTH_MM,
        LOAD_CELL_FIXED_HOLE_XS,
        LOAD_CELL_LOAD_HOLE_XS,
    )

# FDM clearance around the measured 12.75 mm square bar (pocket, not a press fit).
POCKET_CLEARANCE_MM = 0.4
FLANGE_MARGIN_MM = 8.0  # ref: README — min 5 mm beyond outermost hole centers
EDGE_MARGIN_MM = 4.0

FLOOR_T_MM = 5.0
WALL_T_MM = 4.0
WALL_H_MM = BAR_HEIGHT_MM
CLAMP_TAB_Y_MM = 28.0  # C-clamp bite beside the bar; do not pinch the cell
PAD_SIZE_MM = 70.0  # rocks-glass foot; not the 110 mm product plate
PAD_T_MM = 5.0
GROOVE_D_MM = 2.0
BOOLEAN_OVERLAP_MM = 0.2

# Printed bench pins (not metal M4). Taper seats in the M4 tap minor (~Ø3.5 mm).
PIN_HEAD_D_MM = 8.0
PIN_HEAD_T_MM = 3.0
PIN_SHOULDER_D_MM = 4.2  # under the Ø4.4 mm plate hole
PIN_SHOULDER_L_MM = 5.0  # matches cleat floor / pad thickness
PIN_ROOT_D_MM = 3.45
PIN_TIP_D_MM = 3.15
PIN_TAPER_L_MM = 10.0  # into the 12.75 mm bar; do not punch out the far side
PIN_SLOT_L_MM = 6.5
PIN_SLOT_W_MM = 1.2
PIN_SLOT_D_MM = 1.5
PIN_SET_PITCH_MM = 14.0

POCKET_W_MM = BAR_WIDTH_MM + POCKET_CLEARANCE_MM

# Local +X on the cleat starts at the wire-end face of the bar.
_FIXED_XS_FROM_WIRE_END = tuple(
    BAR_LENGTH_MM - x for x in reversed(LOAD_CELL_FIXED_HOLE_XS)
)
_FIXED_POCKET_LEN_MM = max(_FIXED_XS_FROM_WIRE_END) + FLANGE_MARGIN_MM
_LOAD_POCKET_LEN_MM = max(LOAD_CELL_LOAD_HOLE_XS) + FLANGE_MARGIN_MM


def _to_origin(part: Part) -> Part:
    bb = part.bounding_box()
    return part.translate((-bb.min.X, -bb.min.Y, -bb.min.Z))


def _hole_cut(x: float, y: float, hole_d: float, height: float) -> None:
    with Locations((x, y, -BOOLEAN_OVERLAP_MM)):
        Cylinder(
            radius=hole_d / 2,
            height=height,
            align=(Align.CENTER, Align.CENTER, Align.MIN),
            mode=Mode.SUBTRACT,
        )


def build_fixed_cleat() -> Part:
    """U-channel for the wire / fixed end plus a side tab for a C-clamp.

    Print floor-down, walls up. Bar drops in from +Z and cantilevers +X
    toward the arrow / load end. Wires exit −X; clamp the tab only.
    """
    channel_outer_y = POCKET_W_MM + 2 * WALL_T_MM
    floor_y = channel_outer_y + CLAMP_TAB_Y_MM
    floor_y_min = -(POCKET_W_MM / 2 + WALL_T_MM + CLAMP_TAB_Y_MM)
    hole_h = FLOOR_T_MM + 2 * BOOLEAN_OVERLAP_MM

    with BuildPart() as cleat:
        with Locations((0, floor_y_min, 0)):
            Box(
                _FIXED_POCKET_LEN_MM,
                floor_y,
                FLOOR_T_MM,
                align=(Align.MIN, Align.MIN, Align.MIN),
            )
        with Locations((0, POCKET_W_MM / 2, FLOOR_T_MM)):
            Box(
                _FIXED_POCKET_LEN_MM,
                WALL_T_MM,
                WALL_H_MM,
                align=(Align.MIN, Align.MIN, Align.MIN),
            )
        with Locations((0, -(POCKET_W_MM / 2 + WALL_T_MM), FLOOR_T_MM)):
            Box(
                _FIXED_POCKET_LEN_MM,
                WALL_T_MM,
                WALL_H_MM,
                align=(Align.MIN, Align.MIN, Align.MIN),
            )
        for hole_x in _FIXED_XS_FROM_WIRE_END:
            _hole_cut(hole_x, 0, BAR_PLATE_HOLE_D_MM, hole_h)

    return _to_origin(cleat.part)


def build_load_pad() -> Part:
    """70 mm square pad; bar nest and M4 clearance holes on the print-top face.

    Print glass-face down (smooth bed). Flip in use so the groove sits on
    the arrow / load end. Most of the pad hangs past the free end.
    """
    hole_h = PAD_T_MM + 2 * BOOLEAN_OVERLAP_MM
    groove_x0 = -PAD_SIZE_MM / 2 + EDGE_MARGIN_MM

    with BuildPart() as pad:
        Box(
            PAD_SIZE_MM,
            PAD_SIZE_MM,
            PAD_T_MM,
            align=(Align.CENTER, Align.CENTER, Align.MIN),
        )
        with Locations((groove_x0, -POCKET_W_MM / 2, PAD_T_MM - GROOVE_D_MM)):
            Box(
                _LOAD_POCKET_LEN_MM,
                POCKET_W_MM,
                GROOVE_D_MM + BOOLEAN_OVERLAP_MM,
                align=(Align.MIN, Align.MIN, Align.MIN),
                mode=Mode.SUBTRACT,
            )
        for hole_x in LOAD_CELL_LOAD_HOLE_XS:
            _hole_cut(groove_x0 + hole_x, 0, BAR_PLATE_HOLE_D_MM, hole_h)

    return _to_origin(pad.part)


def build_bench_pin() -> Part:
    """Headed taper pin for the M4 taps when metal screws are not on hand.

    Print head-down, 100% infill, 4 walls. Duplicate in the slicer or use
    `load_cell_bench_pin_set`. Finger-press into the bar; do not torque.
    """
    with BuildPart() as pin:
        Cylinder(
            radius=PIN_HEAD_D_MM / 2,
            height=PIN_HEAD_T_MM,
            align=(Align.CENTER, Align.CENTER, Align.MIN),
        )
        with Locations((0, 0, PIN_HEAD_T_MM)):
            Cylinder(
                radius=PIN_SHOULDER_D_MM / 2,
                height=PIN_SHOULDER_L_MM,
                align=(Align.CENTER, Align.CENTER, Align.MIN),
            )
        with Locations((0, 0, PIN_HEAD_T_MM + PIN_SHOULDER_L_MM)):
            Cone(
                bottom_radius=PIN_ROOT_D_MM / 2,
                top_radius=PIN_TIP_D_MM / 2,
                height=PIN_TAPER_L_MM,
                align=(Align.CENTER, Align.CENTER, Align.MIN),
            )
        Box(
            PIN_SLOT_L_MM,
            PIN_SLOT_W_MM,
            PIN_SLOT_D_MM + BOOLEAN_OVERLAP_MM,
            align=(Align.CENTER, Align.CENTER, Align.MIN),
            mode=Mode.SUBTRACT,
        )

    return _to_origin(pin.part)


def build_bench_pin_set() -> Part:
    """Four bench pins on a 14 mm grid for one-plate FDM."""
    half = PIN_SET_PITCH_MM / 2
    pins = [
        build_bench_pin().translate((x, y, 0))
        for x in (-half, half)
        for y in (-half, half)
    ]
    combined = pins[0]
    for pin in pins[1:]:
        combined = combined + pin
    return _to_origin(combined)
