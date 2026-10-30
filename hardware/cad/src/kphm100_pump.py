"""Fit-check envelope for one Kamoer KPHM100-HB-B10 pump.

X is horizontal, +Y points rearward toward the motor, and +Z points upward.
The integral mounting plate's rear face is Y=0. Tube paths are clearance
envelopes; detailed barb profiles, the shaft, and wires are omitted.

ref: refs/kphm100-mount-plate.md
"""

from __future__ import annotations

from math import cos, radians, sin, tan

from build123d import (
    Align,
    Axis,
    Box,
    BuildLine,
    BuildPart,
    BuildSketch,
    Circle,
    Compound,
    Cylinder,
    Line,
    Locations,
    Mode,
    Part,
    Plane,
    TangentArc,
    chamfer,
    fillet,
    sweep,
)

try:
    from ._dims import KPHM100_MOTOR_SIDE_HOLE_CENTERS
except ImportError:
    from _dims import KPHM100_MOTOR_SIDE_HOLE_CENTERS

# Small extension beyond a cutting face for reliable Boolean subtraction.
BOOLEAN_OVERLAP_MM = 0.1

# Integral mounting plate.
MOUNTING_PLATE_T_MM = 7.0
MOUNTING_PLATE_W_MM = 42.5
MOUNTING_PLATE_H_MM = 42.5
MOUNTING_PLATE_STRAIGHT_SIDE_MM = 30.0
MOUNTING_PLATE_CORNER_R_MM = (
    MOUNTING_PLATE_W_MM - MOUNTING_PLATE_STRAIGHT_SIDE_MM
) / 2
MOUNTING_HOLE_D_MM = 2.4
MOUNTING_HOLE_DEPTH_MM = 6.0
MOUNTING_HOLE_CENTERS_MM = tuple(
    (hole.x, hole.y) for hole in KPHM100_MOTOR_SIDE_HOLE_CENTERS
)
PUMP_HEAD_W_MM = 35.28
PUMP_HEAD_H_MM = 37.0
PUMP_HEAD_FORWARD_MM = 26.66
PUMP_HEAD_BOTTOM_STRAIGHT_MM = 21.4
PUMP_HEAD_BOTTOM_CORNER_R_MM = (
    PUMP_HEAD_W_MM - PUMP_HEAD_BOTTOM_STRAIGHT_MM
) / 2
PUMP_HEAD_SIDE_STRAIGHT_MM = 22.0
PUMP_HEAD_FRONT_CHAMFER_LENGTH_MM = 4.5
PUMP_HEAD_FRONT_CHAMFER_ANGLE_DEG = 60.0
TUBE_EXIT_OVERALL_W_MM = 50.0
TUBE_EXIT_D_MM = 9.0
TUBE_EXIT_ANGLE_DEG = 55.0
TUBE_OD_MM = 6.0
TUBE_TOP_FROM_HOUSING_BOTTOM_MM = 58.0
GEARBOX_D_MM = 31.0
GEARBOX_LENGTH_MM = 11.9

# Measured 2026-07-18.
MOTOR_CAN_D_MM = 27.6
MOTOR_CAN_LENGTH_MM = 32.6
BACK_BOSS_D_MM = 9.75
BACK_BOSS_LENGTH_MM = 1.67
TERMINAL_LENGTH_MM = 6.0
TERMINAL_W_MM = 3.0
TERMINAL_T_MM = 0.5
TERMINAL_CENTER_INSET_MM = 2.0

TOTAL_REAR_LENGTH_MM = GEARBOX_LENGTH_MM + MOTOR_CAN_LENGTH_MM
MAX_REAR_PROJECTION_MM = TOTAL_REAR_LENGTH_MM + max(
    BACK_BOSS_LENGTH_MM,
    TERMINAL_LENGTH_MM,
)
TOP_ENVELOPE_Z_MM = -PUMP_HEAD_H_MM / 2 + TUBE_TOP_FROM_HOUSING_BOTTOM_MM
BOTTOM_ENVELOPE_Z_MM = -max(MOUNTING_PLATE_H_MM, PUMP_HEAD_H_MM) / 2


def _axial_cylinder(diameter: float, length: float, y: float) -> Part:
    """Build a cylinder along +Y with its front face at ``y``."""
    cylinder = Cylinder(
        radius=diameter / 2,
        height=length,
        align=(Align.CENTER, Align.CENTER, Align.MIN),
    ).rotate(Axis.X, -90)
    return cylinder.translate((0, y, 0))


def build() -> Compound:
    """Return the measured pump and attached-tube clearance envelope."""
    with BuildPart() as mounting_section:
        Box(
            MOUNTING_PLATE_W_MM,
            MOUNTING_PLATE_T_MM,
            MOUNTING_PLATE_H_MM,
            align=(Align.CENTER, Align.MAX, Align.CENTER),
        )
        fillet(
            mounting_section.edges().filter_by(Axis.Y),
            radius=MOUNTING_PLATE_CORNER_R_MM,
        )
        with Locations(
            *[
                (hole_x, BOOLEAN_OVERLAP_MM, hole_z)
                for hole_x, hole_z in MOUNTING_HOLE_CENTERS_MM
            ]
        ):
            Cylinder(
                radius=MOUNTING_HOLE_D_MM / 2,
                height=MOUNTING_HOLE_DEPTH_MM + BOOLEAN_OVERLAP_MM,
                rotation=(90, 0, 0),
                align=(Align.CENTER, Align.CENTER, Align.MIN),
                mode=Mode.SUBTRACT,
            )

    housing_bottom_z = -PUMP_HEAD_H_MM / 2
    lower_head_height = (
        PUMP_HEAD_BOTTOM_CORNER_R_MM + PUMP_HEAD_SIDE_STRAIGHT_MM
    )
    curve_start_z = housing_bottom_z + lower_head_height
    curve_rise = PUMP_HEAD_H_MM - lower_head_height
    # Circle radius from the measured top-arc chord and sagitta.
    curve_radius = PUMP_HEAD_W_MM**2 / (8 * curve_rise) + curve_rise / 2
    curve_center_z = PUMP_HEAD_H_MM / 2 - curve_radius

    with BuildPart() as lower_head:
        with Locations((0, 0, housing_bottom_z)):
            Box(
                PUMP_HEAD_W_MM,
                PUMP_HEAD_FORWARD_MM,
                lower_head_height,
                align=(Align.CENTER, Align.MAX, Align.MIN),
            )
        bottom_edges = [
            edge
            for edge in lower_head.edges().filter_by(Axis.Y)
            if edge.center().Z < curve_start_z
        ]
        fillet(bottom_edges, radius=PUMP_HEAD_BOTTOM_CORNER_R_MM)

    top_curve = Cylinder(
        radius=curve_radius,
        height=PUMP_HEAD_FORWARD_MM,
        align=(Align.CENTER, Align.CENTER, Align.MIN),
    ).rotate(Axis.X, 90)
    top_curve = top_curve.translate((0, 0, curve_center_z))
    top_clip = Box(
        PUMP_HEAD_W_MM,
        PUMP_HEAD_FORWARD_MM,
        curve_rise,
        align=(Align.CENTER, Align.MAX, Align.MIN),
    ).translate((0, 0, curve_start_z))
    head_body = lower_head.part + (top_curve & top_clip)
    front_face = min(head_body.faces(), key=lambda face: face.center().Y)
    front_inset = PUMP_HEAD_FRONT_CHAMFER_LENGTH_MM
    chamfer_axial_depth = front_inset / tan(
        radians(PUMP_HEAD_FRONT_CHAMFER_ANGLE_DEG)
    )
    head = chamfer(
        front_face.edges(),
        length=front_inset,
        length2=chamfer_axial_depth,
        reference=front_face,
    ).translate(
        (0, -MOUNTING_PLATE_T_MM, 0)
    )

    tube_y = -MOUNTING_PLATE_T_MM - PUMP_HEAD_FORWARD_MM / 2
    tube_x = (TUBE_EXIT_OVERALL_W_MM - TUBE_EXIT_D_MM) / 2
    housing_side_x = PUMP_HEAD_W_MM / 2
    exit_horizontal_run = tube_x - housing_side_x
    exit_angle_rad = radians(TUBE_EXIT_ANGLE_DEG)
    exit_top_z = exit_horizontal_run * (
        1 + sin(exit_angle_rad)
    ) / cos(exit_angle_rad)
    housing_top_z = PUMP_HEAD_H_MM / 2
    tube_top_z = -PUMP_HEAD_H_MM / 2 + TUBE_TOP_FROM_HOUSING_BOTTOM_MM
    tube_parts: list[Part] = []
    for side in (-1, 1):
        housing_exit = (side * housing_side_x, tube_y, 0)
        exit_end = (side * tube_x, tube_y, exit_top_z)
        exit_tangent = (
            side * cos(exit_angle_rad),
            0,
            sin(exit_angle_rad),
        )
        exit_start = tuple(
            point - direction * TUBE_EXIT_D_MM / 2
            for point, direction in zip(housing_exit, exit_tangent)
        )
        with BuildLine() as exit_path:
            Line(exit_start, housing_exit)
            TangentArc(housing_exit, exit_end, tangent=exit_tangent)
            Line(exit_end, (side * tube_x, tube_y, housing_top_z))
        with BuildSketch(
            Plane(origin=exit_start, z_dir=exit_tangent)
        ) as exit_section:
            Circle(radius=TUBE_EXIT_D_MM / 2)
        exit_riser = sweep(exit_section.sketch, path=exit_path.line)

        vertical_tube = Cylinder(
            radius=TUBE_OD_MM / 2,
            height=tube_top_z - housing_top_z,
            align=(Align.CENTER, Align.CENTER, Align.MIN),
        ).translate((side * tube_x, tube_y, housing_top_z))
        tube_parts.extend((exit_riser, vertical_tube))

    gearbox = _axial_cylinder(GEARBOX_D_MM, GEARBOX_LENGTH_MM, 0)
    motor_can = _axial_cylinder(
        MOTOR_CAN_D_MM,
        MOTOR_CAN_LENGTH_MM,
        GEARBOX_LENGTH_MM,
    )
    back_boss = _axial_cylinder(
        BACK_BOSS_D_MM,
        BACK_BOSS_LENGTH_MM,
        TOTAL_REAR_LENGTH_MM,
    )
    terminal_z = MOTOR_CAN_D_MM / 2 - TERMINAL_CENTER_INSET_MM
    terminals = [
        Box(
            TERMINAL_W_MM,
            TERMINAL_LENGTH_MM,
            TERMINAL_T_MM,
            align=(Align.CENTER, Align.MIN, Align.CENTER),
        ).translate((0, TOTAL_REAR_LENGTH_MM, side * terminal_z))
        for side in (-1, 1)
    ]

    return Compound(
        children=[
            mounting_section.part,
            head,
            *tube_parts,
            gearbox,
            motor_can,
            back_boss,
            *terminals,
        ]
    )
