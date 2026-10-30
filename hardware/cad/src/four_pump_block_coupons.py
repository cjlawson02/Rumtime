"""Small FDM fit coupons for four-pump-block critical interfaces.

1. Pump-mount coupon — one front-panel station (Ø32 + keyed M3 holes).
2. Tube-clamp coupon — the real top-panel clamp cluster on a small pad.
3. Front-channel coupon — short U-channel (0.35 mm fit; use mount coupon as insert).

ref: refs/four-pump-block.md
ref: refs/kphm100-mount-plate.md
"""

from __future__ import annotations

from build123d import (
    Align,
    Axis,
    Box,
    BuildPart,
    Cylinder,
    Locations,
    Mode,
    Part,
    fillet,
)

try:
    from .four_pump_block import (
        BOOLEAN_OVERLAP_MM,
        CLAMP_CAVITY_D_MM,
        CLAMP_LENGTH_MM,
        CLAMP_RAMP_RUN_MM,
        CLAMP_WALL_T_MM,
        FRONT_PANEL_CORNER_FILLET_R_MM,
        FRONT_PANEL_FRONT_Y_MM,
        FRONT_PANEL_W_MM,
        FRONT_PLATE_T_MM,
        PANEL_CHANNEL_INNER_X_MM,
        PANEL_CHANNEL_OUTER_X_MM,
        PANEL_CHANNEL_Y_MAX_MM,
        PANEL_CHANNEL_Y_MIN_MM,
        PUMP_CLEARANCE_D_MM,
        PUMP_HOLE_CENTERS_MM,
        PUMP_HOLE_D_MM,
        SLIDE_FIT_CLEARANCE_MM,
        SLIDER_T_MM,
        _press_fit_clamp_cluster,
        clamp_x_centers,
    )
except ImportError:
    from four_pump_block import (
        BOOLEAN_OVERLAP_MM,
        CLAMP_CAVITY_D_MM,
        CLAMP_LENGTH_MM,
        CLAMP_RAMP_RUN_MM,
        CLAMP_WALL_T_MM,
        FRONT_PANEL_CORNER_FILLET_R_MM,
        FRONT_PANEL_FRONT_Y_MM,
        FRONT_PANEL_W_MM,
        FRONT_PLATE_T_MM,
        PANEL_CHANNEL_INNER_X_MM,
        PANEL_CHANNEL_OUTER_X_MM,
        PANEL_CHANNEL_Y_MAX_MM,
        PANEL_CHANNEL_Y_MIN_MM,
        PUMP_CLEARANCE_D_MM,
        PUMP_HOLE_CENTERS_MM,
        PUMP_HOLE_D_MM,
        SLIDE_FIT_CLEARANCE_MM,
        SLIDER_T_MM,
        _press_fit_clamp_cluster,
        clamp_x_centers,
    )

# Handling margin beyond outermost mount-hole centers (≥5 mm required).
MOUNT_COUPON_MARGIN_MM = 8.0
# Extra pad around the clamp footprint for handling / bed adhesion.
CLAMP_COUPON_PAD_MM = 4.0
# Short slide length for the front-channel fit check.
CHANNEL_COUPON_LENGTH_MM = 30.0


def _to_origin(part: Part) -> Part:
    bb = part.bounding_box()
    return part.translate((-bb.min.X, -bb.min.Y, -bb.min.Z))


def _mount_coupon_xy_size() -> tuple[float, float]:
    xs = [x for x, _ in PUMP_HOLE_CENTERS_MM]
    ys = [y for _, y in PUMP_HOLE_CENTERS_MM]
    return (
        (max(xs) - min(xs)) + 2 * MOUNT_COUPON_MARGIN_MM,
        (max(ys) - min(ys)) + 2 * MOUNT_COUPON_MARGIN_MM,
    )


def build_mount_coupon() -> Part:
    """One front-panel pump station, flat for FDM (holes through +Z).

    Origin at plate center; +X right, +Y up in the motor-side view — same
    keyed pattern the full front plate uses (motor-side X→enclosure X,
    motor-side Y→enclosure Z). Outline corners use the same 1.5 mm fillet
    as the sliding front panel so channel entry matches.
    """
    width, height = _mount_coupon_xy_size()
    thickness = FRONT_PLATE_T_MM

    with BuildPart() as coupon:
        Box(
            width,
            height,
            thickness,
            align=(Align.CENTER, Align.CENTER, Align.CENTER),
        )
        fillet(
            coupon.edges().filter_by(Axis.Z),
            radius=FRONT_PANEL_CORNER_FILLET_R_MM,
        )

        Cylinder(
            radius=PUMP_CLEARANCE_D_MM / 2,
            height=thickness + 2,
            align=(Align.CENTER, Align.CENTER, Align.CENTER),
            mode=Mode.SUBTRACT,
        )

        with Locations(*[(x, y, 0) for x, y in PUMP_HOLE_CENTERS_MM]):
            Cylinder(
                radius=PUMP_HOLE_D_MM / 2,
                height=thickness + 2,
                align=(Align.CENTER, Align.CENTER, Align.CENTER),
                mode=Mode.SUBTRACT,
            )

    return coupon.part


def build_tube_clamp_coupon() -> Part:
    """Real four-throat clamp cluster on a small flat pad (clamps up for FDM).

    Reuses `_press_fit_clamp_cluster` from the top tube panel so the snap
    geometry matches the production part — filled inter-clamp block, outer
    end rounds, and side ramps only on the cluster ends.
    """
    centers = clamp_x_centers()
    outer_r = CLAMP_CAVITY_D_MM / 2 + CLAMP_WALL_T_MM
    pad_w = (
        (centers[-1] - centers[0])
        + 2 * (outer_r + CLAMP_RAMP_RUN_MM)
        + 2 * CLAMP_COUPON_PAD_MM
    )
    pad_d = CLAMP_LENGTH_MM + 2 * CLAMP_COUPON_PAD_MM
    pad_t = SLIDER_T_MM

    with BuildPart() as coupon:
        with Locations((0, 0, 0)):
            Box(
                pad_w,
                pad_d,
                pad_t,
                align=(Align.CENTER, Align.CENTER, Align.MIN),
            )
        _press_fit_clamp_cluster(y=0.0, z_panel_top=pad_t)

    return coupon.part


def build_front_channel_coupon() -> Part:
    """Short +X U-channel matching the body's front-panel slide slot.

    Same engagement (1.25 mm), slot clearance (0.35 mm), and front-wall
    stack as `build_body`. Slide an edge of the mount coupon in from +Z.
    """
    length = CHANNEL_COUPON_LENGTH_MM
    channel_w = PANEL_CHANNEL_OUTER_X_MM - PANEL_CHANNEL_INNER_X_MM
    channel_d = PANEL_CHANNEL_Y_MAX_MM - PANEL_CHANNEL_Y_MIN_MM
    panel_slot_y = FRONT_PANEL_FRONT_Y_MM - SLIDE_FIT_CLEARANCE_MM
    panel_slot_d = FRONT_PLATE_T_MM + 2 * SLIDE_FIT_CLEARANCE_MM
    panel_slot_outer_x = FRONT_PANEL_W_MM / 2 + SLIDE_FIT_CLEARANCE_MM
    panel_slot_w = (
        panel_slot_outer_x - PANEL_CHANNEL_INNER_X_MM + BOOLEAN_OVERLAP_MM
    )

    with BuildPart() as channel:
        with Locations((PANEL_CHANNEL_INNER_X_MM, PANEL_CHANNEL_Y_MIN_MM, 0)):
            Box(
                channel_w,
                channel_d,
                length,
                align=(Align.MIN, Align.MIN, Align.MIN),
            )
        with Locations(
            (
                PANEL_CHANNEL_INNER_X_MM - BOOLEAN_OVERLAP_MM,
                panel_slot_y,
                -BOOLEAN_OVERLAP_MM,
            )
        ):
            Box(
                panel_slot_w,
                panel_slot_d,
                length + 2 * BOOLEAN_OVERLAP_MM,
                align=(Align.MIN, Align.MIN, Align.MIN),
                mode=Mode.SUBTRACT,
            )

    return _to_origin(channel.part)
