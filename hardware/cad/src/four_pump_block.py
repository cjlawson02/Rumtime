"""Parameterized 1x4 KPHM100 pump-block enclosure.

X spans the pump row, +Y points rearward, and +Z points upward. The sliding
front panel's pump-contact face is Y=-7; pump heads project toward -Y.

Fixed floor with top sliding tube panel: flat slider with four exterior
curved press-fit clamps for 3x5 mm line tubing.

ref: refs/four-pump-block.md
ref: refs/kphm100-mount-plate.md
"""

from __future__ import annotations

from build123d import (
    Align,
    Axis,
    Box,
    BuildPart,
    Compound,
    Cylinder,
    Face,
    Locations,
    Mode,
    Part,
    Vector,
    Wire,
    add,
    extrude,
    fillet,
)

try:
    from .kphm100_pump import (
        MAX_REAR_PROJECTION_MM,
        MOUNTING_HOLE_CENTERS_MM as PUMP_HOLE_CENTERS_MM,
        build as build_pump,
    )
except ImportError:
    from kphm100_pump import (
        MAX_REAR_PROJECTION_MM,
        MOUNTING_HOLE_CENTERS_MM as PUMP_HOLE_CENTERS_MM,
        build as build_pump,
    )

try:
    from ._dims import (
        KPHM100_CLEARANCE_D_MM as PUMP_CLEARANCE_D_MM,
        KPHM100_MOUNT_HOLE_D_MM as PUMP_HOLE_D_MM,
    )
except ImportError:
    # Custom-interface clearances; ref: refs/kphm100-mount-plate.md
    PUMP_CLEARANCE_D_MM = 32.0
    PUMP_HOLE_D_MM = 3.3

# Enclosure envelope — ref: refs/four-pump-block.md
PUMP_COUNT = 4
PUMP_PITCH_MM = 55.0
BODY_W_MM = 220.0
BODY_D_MM = 75.0
# Interior cavity height between fixed-floor top and top-panel bottom.
BODY_H_MM = 48.0
WALL_T_MM = 2.0
FRONT_PLATE_T_MM = WALL_T_MM
FRONT_PANEL_W_MM = 213.0
SLIDER_T_MM = 2.0
SLIDE_FIT_CLEARANCE_MM = 0.35
REAR_WALL_SLIDER_CLEARANCE_MM = 0.50
BODY_OUTER_FILLET_R_MM = 1.0
SLIDER_CORNER_FILLET_R_MM = 1.5
FRONT_PANEL_CORNER_FILLET_R_MM = SLIDER_CORNER_FILLET_R_MM
PRINT_XY_LIMIT_MM = 280.0
# Small extension past a cutting face for reliable Boolean subtraction.
BOOLEAN_OVERLAP_MM = 0.1

# The front panel contacts the integral plate at the validated Y=-7 mm datum.
PUMP_MOUNT_DATUM_Y_MM = -7.0
FRONT_PANEL_FRONT_Y_MM = PUMP_MOUNT_DATUM_Y_MM
FRONT_PANEL_REAR_Y_MM = FRONT_PANEL_FRONT_Y_MM + FRONT_PLATE_T_MM
PUMP_REAR_Y_MM = PUMP_MOUNT_DATUM_Y_MM + MAX_REAR_PROJECTION_MM

# Vertical panel channels.
PANEL_GROOVE_ENGAGEMENT_MM = 1.25
PANEL_CHANNEL_INNER_X_MM = FRONT_PANEL_W_MM / 2 - PANEL_GROOVE_ENGAGEMENT_MM
PANEL_CHANNEL_OUTER_X_MM = (
    FRONT_PANEL_W_MM / 2 + SLIDE_FIT_CLEARANCE_MM + WALL_T_MM
)
PANEL_CHANNEL_Y_MIN_MM = (
    FRONT_PANEL_FRONT_Y_MM - WALL_T_MM - SLIDE_FIT_CLEARANCE_MM
)
# Channel housing extends slightly behind the panel slot into the body (+Y).
PANEL_CHANNEL_Y_MAX_MM = 1.0

# Rear-entry top tube-panel slider.
SLIDER_W_MM = 216.0
SLIDER_GROOVE_ENGAGEMENT_MM = 1.0
SLIDER_FRONT_Y_MM = FRONT_PANEL_REAR_Y_MM + SLIDE_FIT_CLEARANCE_MM
SLIDER_REAR_Y_MM = BODY_D_MM
SLIDER_GROOVE_INNER_X_MM = SLIDER_W_MM / 2 - SLIDER_GROOVE_ENGAGEMENT_MM
SLIDER_GROOVE_OUTER_X_MM = BODY_W_MM / 2
SLIDER_GROOVE_FRONT_Y_MM = PANEL_CHANNEL_Y_MIN_MM
SLIDER_GROOVE_STOP_REAR_Y_MM = FRONT_PANEL_REAR_Y_MM

# Fixed floor and cavity / top slider stack.
CAVITY_BOTTOM_Z_MM = WALL_T_MM
CAVITY_TOP_Z_MM = CAVITY_BOTTOM_Z_MM + BODY_H_MM
TOP_PANEL_BOTTOM_Z_MM = CAVITY_TOP_Z_MM
TOP_PANEL_TOP_Z_MM = TOP_PANEL_BOTTOM_Z_MM + SLIDER_T_MM
TOP_SLOT_BOTTOM_Z_MM = TOP_PANEL_BOTTOM_Z_MM - SLIDE_FIT_CLEARANCE_MM
TOP_SLOT_TOP_Z_MM = TOP_PANEL_TOP_Z_MM + SLIDE_FIT_CLEARANCE_MM
TOP_RIM_Z_MM = TOP_SLOT_TOP_Z_MM + WALL_T_MM

# Front pump panel rests on the fixed floor; channels open at top rim.
FRONT_PANEL_BOTTOM_Z_MM = CAVITY_BOTTOM_Z_MM
FRONT_PANEL_H_MM = TOP_RIM_Z_MM - FRONT_PANEL_BOTTOM_Z_MM
PANEL_CHANNEL_H_MM = TOP_RIM_Z_MM
# Fit-test pump center: ≥5 mm flange beyond outermost mount holes on the panel.
PUMP_CENTER_Z_MM = 29.0

# Provisional PCB keep-out only; height scaled to the slim shell, not a board outline.
# Box args map as: width→X, depth→enclosure +Y, height→enclosure +Z.
PCB_W_MM = 170.0
PCB_Y_MM = 18.0
PCB_Z_MM = 40.0
PCB_REAR_GAP_AFTER_MOTOR_MM = 8.0

# Rear wiring opening; connector-specific geometry remains deferred.
CABLE_EXIT_W_MM = 36.0
CABLE_EXIT_H_MM = 18.0
CABLE_EXIT_BOTTOM_Z_MM = CAVITY_BOTTOM_Z_MM + 8.0

# Top tube panel — flat slider with exterior press-fit clamps for 3x5 mm tubing.
TUBE_LINE_OD_MM = 5.0
CLAMP_LENGTH_MM = 15.0
CLAMP_CAVITY_D_MM = 5.15
CLAMP_THROAT_MM = 3.9
CLAMP_WALL_T_MM = 1.5
# Overall height of the filled clamp block above the panel (open-top C).
CLAMP_BLOCK_H_MM = 4.0
# Angled plastic ramps on the outer ends of the clamp cluster.
CLAMP_RAMP_RUN_MM = 8.0
# Tight rear cluster centered above the PCB / cable-exit zone.
CLAMP_CLUSTER_PITCH_MM = 10.0
CLAMP_Y_MM = BODY_D_MM - 12.0


def clamp_x_centers() -> tuple[float, ...]:
    """Return four closely spaced clamp centers about X=0."""
    first = -((PUMP_COUNT - 1) * CLAMP_CLUSTER_PITCH_MM) / 2
    return tuple(first + index * CLAMP_CLUSTER_PITCH_MM for index in range(PUMP_COUNT))


def pump_x_centers() -> tuple[float, ...]:
    """Return symmetric pump centers without altering each keyed hole pattern."""
    first = -((PUMP_COUNT - 1) * PUMP_PITCH_MM) / 2
    return tuple(first + index * PUMP_PITCH_MM for index in range(PUMP_COUNT))


def _validate_parameters() -> None:
    pump_centers = pump_x_centers()
    outer_hole_x = max(
        abs(pump_x + hole_x)
        for pump_x in pump_centers
        for hole_x, _ in PUMP_HOLE_CENTERS_MM
    )
    horizontal_flange = FRONT_PANEL_W_MM / 2 - outer_hole_x
    if horizontal_flange < 5.0:
        raise ValueError("Front plate leaves less than 5 mm beyond a pump hole center")

    min_hole_z = min(
        PUMP_CENTER_Z_MM + hole_z for _, hole_z in PUMP_HOLE_CENTERS_MM
    )
    max_hole_z = max(
        PUMP_CENTER_Z_MM + hole_z for _, hole_z in PUMP_HOLE_CENTERS_MM
    )
    if (
        min_hole_z - FRONT_PANEL_BOTTOM_Z_MM < 5.0
        or FRONT_PANEL_BOTTOM_Z_MM + FRONT_PANEL_H_MM - max_hole_z < 5.0
    ):
        raise ValueError("Front plate leaves less than 5 mm vertical pump-hole flange")

    if max(BODY_W_MM, BODY_D_MM) > PRINT_XY_LIMIT_MM:
        raise ValueError("Enclosure exceeds the buffered XY print-bed limit")

    printed_depth = BODY_D_MM - PANEL_CHANNEL_Y_MIN_MM
    if printed_depth > PRINT_XY_LIMIT_MM:
        raise ValueError("Printed body exceeds the buffered XY print-bed limit")

    rear_pcb_y = PUMP_REAR_Y_MM + PCB_REAR_GAP_AFTER_MOTOR_MM
    if rear_pcb_y + PCB_Y_MM > BODY_D_MM - WALL_T_MM:
        raise ValueError("Rear PCB keep-out does not fit inside body depth")

    pcb_bottom_z = CAVITY_BOTTOM_Z_MM + (BODY_H_MM - PCB_Z_MM) / 2
    if pcb_bottom_z <= CAVITY_BOTTOM_Z_MM:
        raise ValueError("Rear PCB keep-out does not clear the cavity bottom")
    if pcb_bottom_z + PCB_Z_MM >= CAVITY_TOP_Z_MM:
        raise ValueError("Rear PCB keep-out collides with the top panel datum")

    if PANEL_CHANNEL_OUTER_X_MM > BODY_W_MM / 2:
        raise ValueError("Panel channels exceed the enclosure width")

    if FRONT_PANEL_REAR_Y_MM + SLIDE_FIT_CLEARANCE_MM >= 0:
        raise ValueError("Sliding panel must remain forward of the body datum")

    if CLAMP_THROAT_MM >= CLAMP_CAVITY_D_MM:
        raise ValueError("Tube clamp throat must be narrower than the clamp cavity")
    if CLAMP_CAVITY_D_MM < TUBE_LINE_OD_MM:
        raise ValueError("Tube clamp cavity must accept 3x5 mm line tubing OD")
    if CLAMP_BLOCK_H_MM < CLAMP_CAVITY_D_MM * 0.65:
        raise ValueError("Clamp block height is too short for the tube cavity")
    if CLAMP_CLUSTER_PITCH_MM < CLAMP_CAVITY_D_MM + 2 * CLAMP_WALL_T_MM:
        raise ValueError("Clamp cluster pitch is tighter than the clamp outer diameter")
    clamp_span = (PUMP_COUNT - 1) * CLAMP_CLUSTER_PITCH_MM + CLAMP_CAVITY_D_MM + 2 * CLAMP_WALL_T_MM
    if clamp_span > CABLE_EXIT_W_MM + 20.0:
        raise ValueError("Clamp cluster is much wider than the rear cable/PCB opening")
    if CLAMP_Y_MM + CLAMP_LENGTH_MM / 2 > SLIDER_REAR_Y_MM:
        raise ValueError("Clamp cluster extends past the top panel rear edge")
    if CLAMP_Y_MM - CLAMP_LENGTH_MM / 2 < SLIDER_FRONT_Y_MM:
        raise ValueError("Clamp cluster extends past the top panel front edge")


def _slider_slot_cut(slot_bottom_z: float, slot_top_z: float) -> None:
    """Cut a rear-entry slider slot into the side groove housings."""
    lid_slot_outer_x = SLIDER_W_MM / 2 + SLIDE_FIT_CLEARANCE_MM
    lid_slot_inner_x = min(
        PANEL_CHANNEL_INNER_X_MM,
        SLIDER_GROOVE_INNER_X_MM,
    ) - BOOLEAN_OVERLAP_MM
    lid_slot_w = lid_slot_outer_x - lid_slot_inner_x
    for side in (-1, 1):
        with Locations(
            (
                side * lid_slot_inner_x,
                SLIDER_GROOVE_STOP_REAR_Y_MM,
                slot_bottom_z,
            )
        ):
            Box(
                lid_slot_w,
                BODY_D_MM - SLIDER_GROOVE_STOP_REAR_Y_MM + BOOLEAN_OVERLAP_MM,
                slot_top_z - slot_bottom_z,
                align=(
                    Align.MIN if side > 0 else Align.MAX,
                    Align.MIN,
                    Align.MIN,
                ),
                mode=Mode.SUBTRACT,
            )


def build_body() -> Part:
    """Shell with fixed floor, front panel channels, and top tube-panel grooves."""
    _validate_parameters()

    with BuildPart() as body:
        # Fixed floor, rear, and side walls.
        with Locations((0, PANEL_CHANNEL_Y_MIN_MM, 0)):
            Box(
                BODY_W_MM,
                BODY_D_MM - PANEL_CHANNEL_Y_MIN_MM,
                WALL_T_MM,
                align=(Align.CENTER, Align.MIN, Align.MIN),
            )
        with Locations((0, BODY_D_MM, 0)):
            Box(
                BODY_W_MM,
                WALL_T_MM,
                CAVITY_TOP_Z_MM - REAR_WALL_SLIDER_CLEARANCE_MM,
                align=(Align.CENTER, Align.MAX, Align.MIN),
            )
        with Locations((-BODY_W_MM / 2, PANEL_CHANNEL_Y_MIN_MM, 0)):
            Box(
                WALL_T_MM,
                BODY_D_MM - PANEL_CHANNEL_Y_MIN_MM,
                TOP_RIM_Z_MM,
                align=(Align.MIN, Align.MIN, Align.MIN),
            )
        with Locations((BODY_W_MM / 2, PANEL_CHANNEL_Y_MIN_MM, 0)):
            Box(
                WALL_T_MM,
                BODY_D_MM - PANEL_CHANNEL_Y_MIN_MM,
                TOP_RIM_Z_MM,
                align=(Align.MAX, Align.MIN, Align.MIN),
            )

        # Side U-channels guide the front panel from the open top.
        channel_w = PANEL_CHANNEL_OUTER_X_MM - PANEL_CHANNEL_INNER_X_MM
        channel_d = PANEL_CHANNEL_Y_MAX_MM - PANEL_CHANNEL_Y_MIN_MM
        for side in (-1, 1):
            with Locations(
                (
                    side * PANEL_CHANNEL_INNER_X_MM,
                    PANEL_CHANNEL_Y_MIN_MM,
                    0,
                )
            ):
                Box(
                    channel_w,
                    channel_d,
                    PANEL_CHANNEL_H_MM,
                    align=(
                        Align.MIN if side > 0 else Align.MAX,
                        Align.MIN,
                        Align.MIN,
                    ),
                )

        panel_slot_y = FRONT_PANEL_FRONT_Y_MM - SLIDE_FIT_CLEARANCE_MM
        panel_slot_d = FRONT_PLATE_T_MM + 2 * SLIDE_FIT_CLEARANCE_MM
        panel_slot_outer_x = FRONT_PANEL_W_MM / 2 + SLIDE_FIT_CLEARANCE_MM
        panel_slot_w = (
            panel_slot_outer_x - PANEL_CHANNEL_INNER_X_MM + BOOLEAN_OVERLAP_MM
        )
        for side in (-1, 1):
            with Locations(
                (
                    side * (PANEL_CHANNEL_INNER_X_MM - BOOLEAN_OVERLAP_MM),
                    panel_slot_y,
                    FRONT_PANEL_BOTTOM_Z_MM,
                )
            ):
                Box(
                    panel_slot_w,
                    panel_slot_d,
                    PANEL_CHANNEL_H_MM - FRONT_PANEL_BOTTOM_Z_MM + 1,
                    align=(
                        Align.MIN if side > 0 else Align.MAX,
                        Align.MIN,
                        Align.MIN,
                    ),
                    mode=Mode.SUBTRACT,
                )

        groove_w = SLIDER_GROOVE_OUTER_X_MM - SLIDER_GROOVE_INNER_X_MM
        groove_d = BODY_D_MM - SLIDER_GROOVE_FRONT_Y_MM

        # Top tube-panel groove housings.
        for side in (-1, 1):
            with Locations(
                (
                    side * SLIDER_GROOVE_INNER_X_MM,
                    SLIDER_GROOVE_FRONT_Y_MM,
                    CAVITY_TOP_Z_MM,
                )
            ):
                Box(
                    groove_w,
                    groove_d,
                    TOP_RIM_Z_MM - CAVITY_TOP_Z_MM,
                    align=(
                        Align.MIN if side > 0 else Align.MAX,
                        Align.MIN,
                        Align.MIN,
                    ),
                )
        _slider_slot_cut(TOP_SLOT_BOTTOM_Z_MM, TOP_SLOT_TOP_Z_MM)

        # Rear cable exit.
        with Locations(
            (
                0,
                BODY_D_MM - WALL_T_MM / 2,
                CABLE_EXIT_BOTTOM_Z_MM + CABLE_EXIT_H_MM / 2,
            )
        ):
            Box(
                CABLE_EXIT_W_MM,
                WALL_T_MM + 2,
                CABLE_EXIT_H_MM,
                align=(Align.CENTER, Align.CENTER, Align.CENTER),
                mode=Mode.SUBTRACT,
            )

        outer_vertical_edges = [
            edge
            for edge in body.edges().filter_by(Axis.Z)
            if abs(abs(edge.center().X) - BODY_W_MM / 2) < 0.01
            and (
                abs(edge.center().Y - PANEL_CHANNEL_Y_MIN_MM) < 0.01
                or abs(edge.center().Y - BODY_D_MM) < 0.01
            )
        ]
        fillet(outer_vertical_edges, radius=BODY_OUTER_FILLET_R_MM)

    return body.part


def build_front_plate() -> Part:
    """Thin pump interface that drops into the body's vertical channels."""
    _validate_parameters()
    panel_center_y = FRONT_PANEL_FRONT_Y_MM + FRONT_PLATE_T_MM / 2

    with BuildPart() as front:
        with Locations((0, FRONT_PANEL_FRONT_Y_MM, FRONT_PANEL_BOTTOM_Z_MM)):
            Box(
                FRONT_PANEL_W_MM,
                FRONT_PLATE_T_MM,
                FRONT_PANEL_H_MM,
                align=(Align.CENTER, Align.MIN, Align.MIN),
            )
        fillet(
            front.edges().filter_by(Axis.Y),
            radius=FRONT_PANEL_CORNER_FILLET_R_MM,
        )

        for pump_x in pump_x_centers():
            with Locations((pump_x, panel_center_y, PUMP_CENTER_Z_MM)):
                Cylinder(
                    radius=PUMP_CLEARANCE_D_MM / 2,
                    height=FRONT_PLATE_T_MM + 2,
                    rotation=(90, 0, 0),
                    align=(Align.CENTER, Align.CENTER, Align.CENTER),
                    mode=Mode.SUBTRACT,
                )

            keyed_holes = [
                (
                    pump_x + hole_x,
                    panel_center_y,
                    PUMP_CENTER_Z_MM + hole_z,
                )
                for hole_x, hole_z in PUMP_HOLE_CENTERS_MM
            ]
            with Locations(*keyed_holes):
                Cylinder(
                    radius=PUMP_HOLE_D_MM / 2,
                    height=FRONT_PLATE_T_MM + 2,
                    rotation=(90, 0, 0),
                    align=(Align.CENTER, Align.CENTER, Align.CENTER),
                    mode=Mode.SUBTRACT,
                )

    return front.part


def build_front_plate_print() -> Part:
    """Return the pump panel broad-face-down for support-free FDM printing."""
    panel = build_front_plate().rotate(Axis.X, 90)
    return panel.translate((0, 0, -panel.bounding_box().min.Z))


def _press_fit_clamp_cluster(y: float, z_panel_top: float) -> None:
    """Add four close press-fit clamps as one filled block on the panel top.

    Built in local Z (0 = panel exterior) then placed, so tube cuts never
    punch through the flat slider.
    """
    centers = clamp_x_centers()
    cavity_r = CLAMP_CAVITY_D_MM / 2
    outer_r = cavity_r + CLAMP_WALL_T_MM
    clamp_h = CLAMP_BLOCK_H_MM
    # Tube axis in the lower half of the low-profile open-top block.
    axis_z = min(cavity_r, clamp_h * 0.5)
    y0 = y - CLAMP_LENGTH_MM / 2

    x_left = centers[0] - outer_r
    x_right = centers[-1] + outer_r
    block_w = x_right - x_left
    block_x = (x_left + x_right) / 2

    with BuildPart() as cluster:
        with Locations((block_x, y, 0)):
            Box(
                block_w,
                CLAMP_LENGTH_MM,
                clamp_h,
                align=(Align.CENTER, Align.CENTER, Align.MIN),
            )

        # Rounded outer ends (clipped to the block height).
        for end_x in (centers[0], centers[-1]):
            with Locations((end_x, y, axis_z)):
                Cylinder(
                    radius=outer_r,
                    height=CLAMP_LENGTH_MM,
                    rotation=(90, 0, 0),
                    align=(Align.CENTER, Align.CENTER, Align.CENTER),
                )

        for side, end_x in ((-1, centers[0]), (1, centers[-1])):
            x_inner = end_x + side * outer_r
            x_outer = end_x + side * (outer_r + CLAMP_RAMP_RUN_MM)
            face = Face(
                Wire.make_polygon(
                    [
                        Vector(x_inner, y0, 0),
                        Vector(x_outer, y0, 0),
                        Vector(x_inner, y0, clamp_h),
                    ],
                    close=True,
                )
            )
            add(extrude(face, amount=CLAMP_LENGTH_MM, dir=(0, 1, 0)))

        # Keep cluster strictly between Z=0 and Z=clamp_h.
        with Locations((block_x, y, -0.05)):
            Box(
                block_w + 2 * CLAMP_RAMP_RUN_MM + 2,
                CLAMP_LENGTH_MM + 2,
                outer_r + 1.0,
                align=(Align.CENTER, Align.CENTER, Align.MAX),
                mode=Mode.SUBTRACT,
            )
        with Locations((block_x, y, clamp_h)):
            Box(
                block_w + 2 * CLAMP_RAMP_RUN_MM + 2,
                CLAMP_LENGTH_MM + 2,
                outer_r + 1.0,
                align=(Align.CENTER, Align.CENTER, Align.MIN),
                mode=Mode.SUBTRACT,
            )

        for clamp_x in centers:
            with Locations((clamp_x, y, axis_z)):
                Cylinder(
                    radius=cavity_r,
                    height=CLAMP_LENGTH_MM + 2,
                    rotation=(90, 0, 0),
                    align=(Align.CENTER, Align.CENTER, Align.CENTER),
                    mode=Mode.SUBTRACT,
                )
            with Locations((clamp_x, y, axis_z)):
                Box(
                    CLAMP_THROAT_MM,
                    CLAMP_LENGTH_MM + 2,
                    clamp_h,
                    align=(Align.CENTER, Align.CENTER, Align.MIN),
                    mode=Mode.SUBTRACT,
                )

    add(cluster.part.translate((0, 0, z_panel_top)))


def build_top_tube_panel() -> Part:
    """Flat rear-entry top slider with a rear cluster of four tube clamps."""
    _validate_parameters()

    with BuildPart() as panel:
        with Locations((0, SLIDER_FRONT_Y_MM, TOP_PANEL_BOTTOM_Z_MM)):
            Box(
                SLIDER_W_MM,
                SLIDER_REAR_Y_MM - SLIDER_FRONT_Y_MM,
                SLIDER_T_MM,
                align=(Align.CENTER, Align.MIN, Align.MIN),
            )
        fillet(
            panel.edges().filter_by(Axis.Z),
            radius=SLIDER_CORNER_FILLET_R_MM,
        )
        _press_fit_clamp_cluster(CLAMP_Y_MM, TOP_PANEL_TOP_Z_MM)

    return panel.part


def build_top_tube_panel_print() -> Part:
    """Return the tube panel flat-down / clamps-up for FDM printing."""
    panel = build_top_tube_panel()
    return panel.translate((0, 0, -panel.bounding_box().min.Z))


def build_pcb_envelope_rear() -> Part:
    """Return the provisional fixed-rear PCB keep-out."""
    _validate_parameters()

    y = PUMP_REAR_Y_MM + PCB_REAR_GAP_AFTER_MOTOR_MM
    z = CAVITY_BOTTOM_Z_MM + (BODY_H_MM - PCB_Z_MM) / 2
    return Box(
        PCB_W_MM,
        PCB_Y_MM,
        PCB_Z_MM,
        align=(Align.CENTER, Align.MIN, Align.MIN),
    ).translate((0, y, z))


def build_pump_envelopes() -> Compound:
    """Return four measured/drawing-derived pump fit envelopes."""
    return Compound(
        children=[
            build_pump().translate(
                (pump_x, PUMP_MOUNT_DATUM_Y_MM, PUMP_CENTER_Z_MM)
            )
            for pump_x in pump_x_centers()
        ]
    )


def build_clearance_rear() -> Compound:
    """Return enclosure parts plus pump and PCB keep-outs for STEP review."""
    return Compound(
        children=[
            build_body(),
            build_front_plate(),
            build_top_tube_panel(),
            build_pump_envelopes(),
            build_pcb_envelope_rear(),
        ]
    )


def build_clearance_rear_top_off() -> Compound:
    """Return the assembled pump block without the top tube panel."""
    return Compound(
        children=[
            build_body(),
            build_front_plate(),
            build_pump_envelopes(),
            build_pcb_envelope_rear(),
        ]
    )
