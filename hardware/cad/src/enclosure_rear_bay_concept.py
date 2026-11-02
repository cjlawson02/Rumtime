"""Rear-bay enclosure concept: pump cartridges at the back.

Massing model, not a buildable chassis. Coffee-machine form: a single
four-high cartridge tower at the rear standing on an electronics bay,
a hood cantilevered forward over a pour bay that is open on the front and
both sides, and a Fire HD 8 kiosk on a pivot mount at the hood front edge.

Cartridges are the real four-pump block assembly (body, front plate, tube
panel, pump envelopes, PCB keep-out), rotated 180 deg so pump heads face
rearward. The tower shell stops flush with the back of the pump-block
housing; cartridges slide in from the open back on rails and blind-mate
their Micro-Fit bus header into a fixed plug at the front of the slot. The
pump heads protrude past the shell, so pickup tubes connect straight to each
head.

The bay lid is the shelf under slot A. The main board rides on a drawer that
pulls out the back; the drawer face is the rear panel (DC barrel jack, SW1
rocker). The model shows the drawer pulled out by DRAWER_SHOWN_OPEN_MM.

+X right, +Y toward the rear, +Z up. Origin: front face, machine centerline,
floor underside.

ref: refs/four-pump-block.md
ref: refs/kphm100-mount-plate.md
ref: refs/estardyn-load-cell.md
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from build123d import Align, Axis, Box, Compound, Cylinder, Shape, Vector

try:
    from . import four_pump_block as _fpb
    from .four_pump_block import (
        PUMP_CENTER_Z_MM,
        build_body,
        build_front_plate,
        build_pcb_envelope_rear,
        build_pump_envelopes,
        build_top_tube_panel,
        pump_x_centers,
    )
    from .load_cell_bar import build as build_load_cell_bar
    from ._dims import BAR_HEIGHT_MM, BAR_LENGTH_MM
except ImportError:
    import four_pump_block as _fpb
    from four_pump_block import (
        PUMP_CENTER_Z_MM,
        build_body,
        build_front_plate,
        build_pcb_envelope_rear,
        build_pump_envelopes,
        build_top_tube_panel,
        pump_x_centers,
    )
    from load_cell_bar import build as build_load_cell_bar
    from _dims import BAR_HEIGHT_MM, BAR_LENGTH_MM

# Assumptions (not measured) — revisit before any wood is cut.
SHELL_T_MM = 12.0  # 1/2" plywood
GLASS_D_MM = 95.0  # largest supported glass: collins
GLASS_H_MM = 160.0
NOZZLE_GLASS_CLEARANCE_MM = 25.0
NOZZLE_PROTRUSION_MM = 6.0
POUR_D_MM = 140.0
CHASE_D_MM = 30.0  # outlet tubes run here, between pour bay and cartridges
SIDE_CABLE_CHANNEL_MM = 20.0  # dry Micro-Fit runs down the tower sides
LEVEL_COUNT = 4
LEVEL_GAP_MM = 16.0  # drip shelf + 10 mm over the pump envelope for the tube bend
SHELF_T_MM = 6.0
ELEC_BOX_INNER_H_MM = 50.0  # board + standoffs + DevKit + mated Micro-Fit plugs
ELEC_BOX_WALL_MM = 3.0
TOP_GAP_MM = 10.0  # tube bend room over slot D
HOOD_INNER_H_MM = 50.0  # outlet tube routing to the nozzle
TRAY_H_MM = 25.0
TRAY_CELL_GAP_MM = 4.0
TRAY_SIDE_MARGIN_MM = 8.0
SPLASH_MARGIN_MM = 40.0  # min. clear width each side of the glass
PLATFORM_MM = 110.0
PLATFORM_T_MM = 6.0
GLASS_CENTER_Y_MM = 70.0
NOZZLE_PLATE_D_MM = 60.0
NOZZLE_COUNT = 16
NOZZLE_RING_D_MM = 36.0
# Amazon Fire HD 8 (12th gen, 2022) — published size, no case.
TABLET_W_MM = 201.9
TABLET_H_MM = 137.3
TABLET_T_MM = 9.6
TABLET_BEZEL_MM = 10.0  # approximate
TABLET_LEAN_DEG = 20.0  # shown tilt, back from vertical
TABLET_TILT_MIN_DEG = 15.0  # hinge stop; keeps the top under CABINET_CLEARANCE_MM
TABLET_TILT_MAX_DEG = 45.0
CABINET_CLEARANCE_MM = 457.2  # 18 in counter to wall-cabinet underside
# Pivoting mount: friction hinge along the hood front edge, cradle + back plate.
TABLET_HINGE_R_MM = 6.0
TABLET_HINGE_Y_MM = 8.0  # hinge axis behind the hood front face
TABLET_HINGE_LEN_MM = 120.0
TABLET_CRADLE_T_MM = 3.0  # cradle floor half-thickness about the hinge axis
TABLET_LIP_H_MM = 10.0  # front lip, stays inside the bottom bezel
TABLET_LIP_T_MM = 4.0
TABLET_BACK_PLATE_H_MM = 90.0
TABLET_BACK_PLATE_T_MM = 4.0
PANEL_INSET_MM = 0.3  # keeps coplanar faces apart in renders
# Rear inlet comb: bottle lines clip here before the pump heads (strain relief + labels).
INLET_COMB_W_MM = 16.0
INLET_COMB_D_MM = 12.0
INLET_CLIP_PITCH_MM = 20.0  # two clips per slot per side, centered on the pump row
# Outlet unions: one per line at each slot's chase exit so a cartridge can come out the back.
OUTLET_UNION_D_MM = 7.0
OUTLET_UNION_L_MM = 8.0
OUTLET_UNION_X_MM = (-15.0, -5.0, 5.0, 15.0)  # matches the tube-panel clamp cluster

# Slot rails: guides along each cartridge side, screwed to the shelf edge.
RAIL_W_MM = 4.0
RAIL_H_MM = 10.0  # above the slot floor
RAIL_CLEARANCE_MM = 0.5  # per side
# Slot dock: floating holder for the Micro-Fit 2x3 cable plug (43025-0600).
# Approximate housing size; mate position comes from four_pump_block.
MICROFIT_PLUG_W_MM = 10.0
MICROFIT_PLUG_H_MM = 9.6
MICROFIT_PLUG_L_MM = 12.0
DOCK_BRACKET_T_MM = 3.0
# Electronics drawer: board tray that slides out the back.
DRAWER_TRAY_T_MM = 3.0
DRAWER_SHOWN_OPEN_MM = 90.0  # render pose; 0 = closed
DRAWER_TRAVEL_MM = 110.0
# Rear panel hardware on the drawer face (approximate panel-mount parts).
# SW1 round press-fit rocker — ref: refs/sw1-round-rocker.md
ROCKER_BEZEL_D_MM = 22.7
ROCKER_BEZEL_T_MM = 4.0  # assumed
ROCKER_BODY_D_MM = 18.7  # body; panel hole is Ø20
ROCKER_BODY_L_MM = 22.0  # assumed, behind the panel
ROCKER_X_MM = 55.0
# 12 V inlet: screw-terminal female plug in a printed holder — ref: refs/dc-inlet-plug.md
BARREL_FLANGE_D_MM = 20.0  # printed holder collar, assumed
BARREL_FLANGE_T_MM = 3.0  # assumed
BARREL_BODY_D_MM = 14.0
BARREL_BODY_L_MM = 41.0
BARREL_X_MM = 90.0

# Ordered main-controller Edge.Cuts (hardware/kicad/main-controller).
MAIN_PCB_W_MM = 76.7
MAIN_PCB_D_MM = 51.1
MAIN_PCB_T_MM = 1.6
STANDOFF_H_MM = 8.0
# ESP32-S3-DevKitC-1 in sockets — approximate envelope.
DEVKIT_W_MM = 63.0
DEVKIT_D_MM = 25.5
DEVKIT_H_MM = 14.0


@dataclass(frozen=True)
class ScenePart:
    label: str
    role: str
    shape: Shape


def _box(x0: float, x1: float, y0: float, y1: float, z0: float, z1: float) -> Shape:
    return Box(
        x1 - x0, y1 - y0, z1 - z0, align=(Align.MIN, Align.MIN, Align.MIN)
    ).translate((x0, y0, z0))


def _cyl_z(cx: float, cy: float, z0: float, d: float, h: float) -> Shape:
    return Cylinder(
        d / 2, h, align=(Align.CENTER, Align.CENTER, Align.MIN)
    ).translate((cx, cy, z0))


def _bbox_union(shapes: list[Shape]) -> tuple[Vector, Vector]:
    boxes = [s.bounding_box() for s in shapes]
    lo = Vector(
        min(b.min.X for b in boxes),
        min(b.min.Y for b in boxes),
        min(b.min.Z for b in boxes),
    )
    hi = Vector(
        max(b.max.X for b in boxes),
        max(b.max.Y for b in boxes),
        max(b.max.Z for b in boxes),
    )
    return lo, hi


def _cartridge_parts() -> list[tuple[str, Shape]]:
    """Real four-pump block, rotated so pump heads face +Y (rear)."""
    parts = [
        ("cart_body", build_body()),
        ("cart_front_plate", build_front_plate()),
        ("cart_tube_panel", build_top_tube_panel()),
        ("pumps", build_pump_envelopes()),
        ("module_pcb", build_pcb_envelope_rear()),
    ]
    return [(role, shape.rotate(Axis.Z, 180)) for role, shape in parts]


_CART = _cartridge_parts()
_CART_LO, _CART_HI = _bbox_union([s for _, s in _CART])
CART_W_MM = _CART_HI.X - _CART_LO.X
CART_D_MM = _CART_HI.Y - _CART_LO.Y
CART_H_MM = _CART_HI.Z - _CART_LO.Z

# Back of the pump-block housing (body walls), in the rotated cartridge frame
_HOUSING_HI_Y = _bbox_union([shape for role, shape in _CART if role == "cart_body"])[1].Y

# Derived layout
OUTER_W_MM = CART_W_MM + 2 * SIDE_CABLE_CHANNEL_MM + 2 * SHELL_T_MM

DIVIDER_Y_MM = POUR_D_MM
CART_Y0_MM = DIVIDER_Y_MM + SHELL_T_MM + CHASE_D_MM
OUTER_D_MM = CART_Y0_MM + (_HOUSING_HI_Y - _CART_LO.Y)  # shell ends at the housing
PUMP_REAR_Y_MM = CART_Y0_MM + CART_D_MM  # pump heads protrude to here

TRAY_TOP_Z_MM = SHELL_T_MM + TRAY_H_MM
CELL_BOTTOM_Z_MM = TRAY_TOP_Z_MM + TRAY_CELL_GAP_MM
PLATFORM_TOP_Z_MM = CELL_BOTTOM_Z_MM + BAR_HEIGHT_MM + PLATFORM_T_MM
GLASS_TOP_Z_MM = PLATFORM_TOP_Z_MM + GLASS_H_MM
NOZZLE_TIP_Z_MM = GLASS_TOP_Z_MM + NOZZLE_GLASS_CLEARANCE_MM
HOOD_Z_MM = NOZZLE_TIP_Z_MM + NOZZLE_PROTRUSION_MM
HOOD_TOP_Z_MM = HOOD_Z_MM + HOOD_INNER_H_MM + SHELL_T_MM

ELEC_BOX_TOP_Z_MM = SHELL_T_MM + ELEC_BOX_INNER_H_MM + ELEC_BOX_WALL_MM
ELEC_BOX_Y0_MM = CART_Y0_MM - SHELF_T_MM  # chase stays open in front of it

LEVEL_PITCH_MM = CART_H_MM + LEVEL_GAP_MM
LEVEL_Z_MM = tuple(ELEC_BOX_TOP_Z_MM + i * LEVEL_PITCH_MM for i in range(LEVEL_COUNT))
SLOT_NAMES = ("A", "B", "C", "D")  # bottom to top
TOP_Z_MM = LEVEL_Z_MM[-1] + CART_H_MM + TOP_GAP_MM
OUTER_H_MM = TOP_Z_MM + SHELL_T_MM

# Tablet: bottom edge in a cradle that pivots on a hinge at the hood front edge.
# Mount frame: hinge axis at the origin, screen facing -Y, tablet above +Z.
TABLET_HINGE_Z_MM = HOOD_TOP_Z_MM + TABLET_HINGE_R_MM
_LEAN = math.radians(TABLET_LEAN_DEG)


def _tablet_top_z_mm(lean_deg: float) -> float:
    return TABLET_HINGE_Z_MM + (TABLET_CRADLE_T_MM + TABLET_H_MM) * math.cos(math.radians(lean_deg))


TABLET_TOP_Z_MM = _tablet_top_z_mm(TABLET_LEAN_DEG)


def _mount_rear_y_mm(lean_deg: float) -> float:
    """Rearmost Y of tablet + back plate at a given tilt."""
    a = math.radians(lean_deg)
    corners = (
        (TABLET_T_MM, TABLET_CRADLE_T_MM + TABLET_H_MM),
        (TABLET_T_MM + TABLET_BACK_PLATE_T_MM, TABLET_CRADLE_T_MM + TABLET_BACK_PLATE_H_MM),
    )
    return TABLET_HINGE_Y_MM + max(y * math.cos(a) + z * math.sin(a) for y, z in corners)

# Load end of the bar sits under the glass; fixed end toward the tower.
CELL_LOAD_Y_MM = GLASS_CENTER_Y_MM - 10.0
CELL_FIXED_Y_MM = CELL_LOAD_Y_MM + BAR_LENGTH_MM
CELL_POST_D_MM = 20.0
TRAY_REAR_Y_MM = CELL_FIXED_Y_MM - CELL_POST_D_MM - 5.0


def _validate() -> None:
    if CELL_FIXED_Y_MM >= DIVIDER_Y_MM:
        raise ValueError("load-cell fixed end collides with the divider")
    if GLASS_D_MM > OUTER_W_MM - 2 * SPLASH_MARGIN_MM:
        raise ValueError("pour bay too narrow for the glass plus splash margin")
    if HOOD_TOP_Z_MM > TOP_Z_MM:
        raise ValueError("hood rises above the tower")
    if _tablet_top_z_mm(TABLET_TILT_MIN_DEG) > CABINET_CLEARANCE_MM:
        raise ValueError("tablet top hits an 18 in wall cabinet at minimum tilt")
    if _mount_rear_y_mm(TABLET_TILT_MAX_DEG) >= DIVIDER_Y_MM:
        raise ValueError("tablet hits the tower at full tilt")
    if TABLET_W_MM > OUTER_W_MM:
        raise ValueError("tablet wider than the hood")
    if TABLET_HINGE_Y_MM - TABLET_HINGE_R_MM < 0:
        raise ValueError("tablet hinge overhangs the hood front")
    if not 0.0 <= DRAWER_SHOWN_OPEN_MM <= DRAWER_TRAVEL_MM:
        raise ValueError("drawer shown beyond its travel")
    if abs(ROCKER_X_MM - BARREL_X_MM) < (ROCKER_BEZEL_D_MM + BARREL_FLANGE_D_MM) / 2 + 3:
        raise ValueError("SW1 rocker and barrel jack bezels overlap on the rear panel")
    if DRAWER_TRAVEL_MM < MAIN_PCB_D_MM + 4 + SHELL_T_MM:
        raise ValueError("drawer travel does not bring the whole board out of the bay")


def _cart_offset(level: int) -> tuple[float, float, float]:
    return (
        -(_CART_LO.X + _CART_HI.X) / 2,
        CART_Y0_MM - _CART_LO.Y,
        LEVEL_Z_MM[level] - _CART_LO.Z,
    )


def _place_cartridge(level: int) -> list[ScenePart]:
    slot = SLOT_NAMES[level]
    off = _cart_offset(level)
    return [
        ScenePart(f"slot_{slot}_{role}", role, shape.translate(off))
        for role, shape in _CART
    ]


def dock_center(level: int) -> tuple[float, float, float] | None:
    """World position of a slot's Micro-Fit mating face, or None if the block model has none."""
    face = getattr(_fpb, "MICROFIT_FACE_CENTER_MM", None)
    if face is None:
        return None
    dx, dy, dz = _cart_offset(level)
    return (-face[0] + dx, -face[1] + dy, face[2] + dz)


def pump_positions() -> list[tuple[str, int, float, float]]:
    """(slot, pump_number, world_x, world_z) for every pump head."""
    out = []
    for level, slot in enumerate(SLOT_NAMES):
        dx, _, dz = _cart_offset(level)
        xs = sorted(-x + dx for x in pump_x_centers())
        for i, x in enumerate(xs):
            out.append((slot, level * 4 + i + 1, x, PUMP_CENTER_Z_MM + dz))
    return out


def scene() -> list[ScenePart]:
    _validate()
    t = SHELL_T_MM
    w2 = OUTER_W_MM / 2
    inner = w2 - t
    pin = inner - PANEL_INSET_MM  # internal panels stop short of the side walls
    tower_y0 = DIVIDER_Y_MM
    parts: list[ScenePart] = []

    def add(label: str, role: str, shape: Shape) -> None:
        parts.append(ScenePart(label, role, shape))

    # Plinth under the pour bay; tower shell behind it, open at the back
    add("plinth", "wood", _box(-w2, w2, 0, tower_y0, 0, t))
    add("tower_floor", "wood", _box(-pin, pin, tower_y0, OUTER_D_MM, 0, t))
    add("wall_left", "wood", _box(-w2, -inner, tower_y0, OUTER_D_MM, 0, OUTER_H_MM))
    add("wall_right", "wood", _box(inner, w2, tower_y0, OUTER_D_MM, 0, OUTER_H_MM))
    add("top", "wood", _box(-pin, pin, tower_y0, OUTER_D_MM, TOP_Z_MM, OUTER_H_MM))
    # Tower front wall, with an opening where outlet tubes pass into the hood
    add(
        "divider_low",
        "wood",
        _box(-pin, pin, tower_y0, tower_y0 + t, t, HOOD_Z_MM),
    )
    add(
        "divider_high",
        "wood",
        _box(-pin, pin, tower_y0, tower_y0 + t, HOOD_TOP_Z_MM - t, TOP_Z_MM - PANEL_INSET_MM),
    )

    # Hood cantilevered over the open pour bay
    add("hood_top", "wood", _box(-w2, w2, 0, tower_y0, HOOD_TOP_Z_MM - t, HOOD_TOP_Z_MM))
    add("hood_fascia", "wood", _box(-w2, w2, 0, t, HOOD_Z_MM, HOOD_TOP_Z_MM - t - PANEL_INSET_MM))
    for side, sign in (("left", -1), ("right", 1)):
        xa, xb = sorted((sign * w2, sign * inner))
        add(
            f"hood_side_{side}",
            "wood",
            _box(xa, xb, t + PANEL_INSET_MM, tower_y0, HOOD_Z_MM, HOOD_TOP_Z_MM - t - PANEL_INSET_MM),
        )
    add(
        "pour_ceiling",
        "wet_panel",
        _box(-pin, pin, t, tower_y0, HOOD_Z_MM, HOOD_Z_MM + SHELF_T_MM),
    )
    add(
        "nozzle_plate",
        "nozzle",
        _cyl_z(0, GLASS_CENTER_Y_MM, HOOD_Z_MM - 4, NOZZLE_PLATE_D_MM, 4),
    )
    for i in range(NOZZLE_COUNT):
        a = 2 * math.pi * i / NOZZLE_COUNT
        r = NOZZLE_RING_D_MM / 2 if i % 2 == 0 else NOZZLE_RING_D_MM / 2 - 8
        add(
            f"nozzle_{i + 1}",
            "nozzle_tip",
            _cyl_z(
                r * math.cos(a),
                GLASS_CENTER_Y_MM + r * math.sin(a),
                NOZZLE_TIP_Z_MM,
                4.0,
                NOZZLE_PROTRUSION_MM - 4,
            ),
        )

    # Pour bay: tray, isolated load-cell cantilever, platform, glass
    tx = w2 - TRAY_SIDE_MARGIN_MM
    add("drip_tray", "tray", _box(-tx, tx, 2, TRAY_REAR_Y_MM, t, TRAY_TOP_Z_MM))
    add(
        "cell_post",
        "cell_post",
        _box(-15, 15, CELL_FIXED_Y_MM - CELL_POST_D_MM, CELL_FIXED_Y_MM, t, CELL_BOTTOM_Z_MM),
    )
    bar = build_load_cell_bar().rotate(Axis.Z, 90).translate((0, CELL_LOAD_Y_MM, CELL_BOTTOM_Z_MM))
    add("load_cell_bar", "load_cell", bar)
    add(
        "platform",
        "platform",
        _box(
            -PLATFORM_MM / 2,
            PLATFORM_MM / 2,
            GLASS_CENTER_Y_MM - PLATFORM_MM / 2,
            GLASS_CENTER_Y_MM + PLATFORM_MM / 2,
            PLATFORM_TOP_Z_MM - PLATFORM_T_MM,
            PLATFORM_TOP_Z_MM,
        ),
    )
    add("glass", "glass", _cyl_z(0, GLASS_CENTER_Y_MM, PLATFORM_TOP_Z_MM, GLASS_D_MM, GLASS_H_MM))

    # Cartridge tower: four slots, a shelf under each upper slot (inside the shell)
    sx = CART_W_MM / 2
    for level in range(LEVEL_COUNT):
        if level:
            z = LEVEL_Z_MM[level]
            add(
                f"slot_shelf_{SLOT_NAMES[level]}",
                "shelf",
                _box(-sx, sx, CART_Y0_MM, OUTER_D_MM - PANEL_INSET_MM, z - SHELF_T_MM, z),
            )
        parts.extend(_place_cartridge(level))
        slot = SLOT_NAMES[level]
        z = LEVEL_Z_MM[level]
        for side, sign in (("left", -1), ("right", 1)):
            xa, xb = sorted((sign * (sx + RAIL_CLEARANCE_MM), sign * (sx + RAIL_CLEARANCE_MM + RAIL_W_MM)))
            add(f"rail_{slot}_{side}", "mount",
                _box(xa, xb, CART_Y0_MM, OUTER_D_MM - PANEL_INSET_MM, z - SHELF_T_MM, z + RAIL_H_MM))
        dock = dock_center(level)
        if dock is not None:
            x, y, zc = dock
            pw, ph = MICROFIT_PLUG_W_MM / 2, MICROFIT_PLUG_H_MM / 2
            add(f"dock_plug_{slot}", "tablet",
                _box(x - pw, x + pw, y - MICROFIT_PLUG_L_MM, y, zc - ph, zc + ph))
            y_b = y - MICROFIT_PLUG_L_MM
            add(f"dock_bracket_{slot}", "mount",
                _box(x - pw - 4, x + pw + 4, y_b - DOCK_BRACKET_T_MM, y_b, z - SHELF_T_MM, zc + ph + 3))

    # Outlet tubes (schematic bundle): along the chase, forward through the hood
    chase_y0 = tower_y0 + t + 4
    run_z0 = HOOD_Z_MM + SHELF_T_MM + 6
    run_z1 = run_z0 + 16
    riser_top = LEVEL_Z_MM[-1] + CART_H_MM
    add("outlet_riser", "tube", _box(-20, 20, chase_y0, chase_y0 + 16, LEVEL_Z_MM[0] + 40, riser_top))
    add("outlet_run", "tube", _box(-20, 20, GLASS_CENTER_Y_MM, chase_y0 + 16, run_z0, run_z1))
    union_z = _CART_HI.Z - _CART_LO.Z - 10.0  # tube height over the tube panel
    for name, z in zip(SLOT_NAMES, LEVEL_Z_MM):
        for i, x in enumerate(OUTLET_UNION_X_MM, start=1):
            add(
                f"outlet_union_{name}{i}",
                "mount",
                Cylinder(OUTLET_UNION_D_MM / 2, OUTLET_UNION_L_MM)
                .rotate(Axis.X, 90)
                .translate((x, CART_Y0_MM - 1 - OUTLET_UNION_L_MM / 2, z + union_z)),
            )

    # Rear inlet combs on the side-wall edges, inside the pump-head overhang
    for side, sx in (("left", -1), ("right", 1)):
        x_out = sx * w2
        x_in = sx * (w2 - INLET_COMB_W_MM)
        xa, xb = min(x_out, x_in), max(x_out, x_in)
        add(
            f"inlet_comb_{side}",
            "mount",
            _box(xa, xb, OUTER_D_MM, OUTER_D_MM + INLET_COMB_D_MM, ELEC_BOX_TOP_Z_MM, TOP_Z_MM),
        )
        for name, z in zip(SLOT_NAMES, LEVEL_Z_MM):
            zc = z - _CART_LO.Z + PUMP_CENTER_Z_MM
            for k, dz in enumerate((-INLET_CLIP_PITCH_MM / 2, INLET_CLIP_PITCH_MM / 2)):
                add(
                    f"inlet_clip_{side}_{name}{k + 1}",
                    "tablet",
                    _box(xa + 3, xb - 3, OUTER_D_MM + INLET_COMB_D_MM,
                         OUTER_D_MM + INLET_COMB_D_MM + 6, zc + dz - 4, zc + dz + 4),
                )

    # Electronics bay under slot A; the board rides on a drawer out the back
    bw = ELEC_BOX_WALL_MM
    bz0, bz1 = t, ELEC_BOX_TOP_Z_MM
    by0 = ELEC_BOX_Y0_MM
    rear_y0 = OUTER_D_MM - t
    add("elec_box_lid", "shelf_dry", _box(-pin, pin, by0, OUTER_D_MM, bz1 - bw, bz1))
    add("elec_box_front", "shelf_dry", _box(-pin, pin, by0, by0 + bw, bz0, bz1 - bw))
    for side, sign in (("left", -1), ("right", 1)):
        xa, xb = sorted((sign * (pin - bw), sign * (pin - 2 * PANEL_INSET_MM)))
        add(f"elec_box_{side}", "shelf_dry", _box(xa, xb, by0 + bw, OUTER_D_MM, bz0, bz1 - bw))
    open_y = DRAWER_SHOWN_OPEN_MM
    dx_in = pin - bw - 1.0  # drawer clears the bay walls
    face_y0, face_y1 = rear_y0 + open_y, OUTER_D_MM + open_y
    face_z1 = bz1 - bw - 1.0
    add("drawer_face", "wood", _box(-dx_in, dx_in, face_y0, face_y1, bz0, face_z1))
    tray_y0 = face_y0 - (rear_y0 - by0 - bw - 2.0)
    add("drawer_tray", "shelf_dry",
        _box(-dx_in, dx_in, tray_y0, face_y0, bz0, bz0 + DRAWER_TRAY_T_MM))
    pcb_z = bz0 + DRAWER_TRAY_T_MM + STANDOFF_H_MM
    pcb_x0 = -MAIN_PCB_W_MM / 2
    pcb_y1 = face_y0 - 4
    add(
        "main_controller",
        "main_pcb",
        _box(pcb_x0, pcb_x0 + MAIN_PCB_W_MM, pcb_y1 - MAIN_PCB_D_MM, pcb_y1, pcb_z, pcb_z + MAIN_PCB_T_MM),
    )
    add(
        "devkit",
        "devkit",
        _box(
            pcb_x0 + 6,
            pcb_x0 + 6 + DEVKIT_W_MM,
            pcb_y1 - MAIN_PCB_D_MM / 2 - DEVKIT_D_MM / 2,
            pcb_y1 - MAIN_PCB_D_MM / 2 + DEVKIT_D_MM / 2,
            pcb_z + MAIN_PCB_T_MM,
            pcb_z + MAIN_PCB_T_MM + DEVKIT_H_MM,
        ),
    )
    panel_zc = (bz0 + face_z1) / 2
    add("rocker_sw1_bezel", "tablet",
        Cylinder(ROCKER_BEZEL_D_MM / 2, ROCKER_BEZEL_T_MM).rotate(Axis.X, 90)
        .translate((ROCKER_X_MM, face_y1 + ROCKER_BEZEL_T_MM / 2, panel_zc)))
    paddle = ROCKER_BODY_D_MM * 0.7 / 2
    add("rocker_sw1_paddle", "mount",
        _box(ROCKER_X_MM - paddle, ROCKER_X_MM + paddle, face_y1 + ROCKER_BEZEL_T_MM,
             face_y1 + ROCKER_BEZEL_T_MM + 2, panel_zc - paddle, panel_zc + paddle * 0.4))
    add("rocker_sw1_body", "tablet",
        Cylinder(ROCKER_BODY_D_MM / 2, ROCKER_BODY_L_MM).rotate(Axis.X, 90)
        .translate((ROCKER_X_MM, face_y1 - ROCKER_BODY_L_MM / 2, panel_zc)))
    add("barrel_jack_flange", "mount",
        Cylinder(BARREL_FLANGE_D_MM / 2, BARREL_FLANGE_T_MM).rotate(Axis.X, 90)
        .translate((BARREL_X_MM, face_y1 + BARREL_FLANGE_T_MM / 2, panel_zc)))
    add("barrel_jack_body", "mount",
        Cylinder(BARREL_BODY_D_MM / 2, BARREL_BODY_L_MM).rotate(Axis.X, 90)
        .translate((BARREL_X_MM, face_y1 - BARREL_BODY_L_MM / 2, panel_zc)))

    # Kiosk tablet on a pivoting mount at the hood front edge
    t_lo = TABLET_CRADLE_T_MM  # tablet bottom edge in the mount frame
    half = TABLET_HINGE_LEN_MM / 2
    for side, x0 in (("left", -half - 18), ("right", half + 2)):
        add(
            f"tablet_hinge_block_{side}",
            "mount",
            _box(
                x0,
                x0 + 16,
                TABLET_HINGE_Y_MM - TABLET_HINGE_R_MM,
                TABLET_HINGE_Y_MM + TABLET_HINGE_R_MM,
                HOOD_TOP_Z_MM,
                TABLET_HINGE_Z_MM + TABLET_HINGE_R_MM,
            ),
        )
    tw2 = TABLET_W_MM / 2
    plate_w2 = 60.0
    moving = (
        ("tablet_hinge", "mount",
         Cylinder(TABLET_HINGE_R_MM, TABLET_HINGE_LEN_MM).rotate(Axis.Y, 90)),
        ("tablet_cradle", "mount",
         _box(-tw2 + 20, tw2 - 20, -TABLET_LIP_T_MM, TABLET_T_MM + TABLET_BACK_PLATE_T_MM, -t_lo, t_lo)),
        ("tablet_lip", "mount",
         _box(-tw2 + 20, tw2 - 20, -TABLET_LIP_T_MM, 0, t_lo, t_lo + TABLET_LIP_H_MM - TABLET_CRADLE_T_MM)),
        ("tablet_back_plate", "mount",
         _box(-plate_w2, plate_w2, TABLET_T_MM, TABLET_T_MM + TABLET_BACK_PLATE_T_MM,
              t_lo, t_lo + TABLET_BACK_PLATE_H_MM)),
        ("tablet", "tablet", _box(-tw2, tw2, 0, TABLET_T_MM, t_lo, t_lo + TABLET_H_MM)),
        ("tablet_screen", "screen",
         _box(-tw2 + TABLET_BEZEL_MM, tw2 - TABLET_BEZEL_MM, -0.4, 0.0,
              t_lo + TABLET_BEZEL_MM, t_lo + TABLET_H_MM - TABLET_BEZEL_MM)),
    )
    for label, role, shape in moving:
        add(
            label,
            role,
            shape.rotate(Axis.X, -TABLET_LEAN_DEG).translate((0, TABLET_HINGE_Y_MM, TABLET_HINGE_Z_MM)),
        )

    return parts


def build() -> Compound:
    return Compound(children=[p.shape for p in scene()])


def footprint_mm() -> tuple[float, float, float]:
    return (OUTER_W_MM, OUTER_D_MM, OUTER_H_MM)
