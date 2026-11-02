#!/usr/bin/env python3
"""Shaded SVG views of the rear-bay enclosure concept, tessellated from build123d.

Writes hardware/cad/out/enclosure_rear_bay_concept.svg (four views on one sheet).
Painter's-algorithm flat shading — good enough for layout review, not photoreal.
"""

from __future__ import annotations

import math

import sys
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

CAD_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(CAD_ROOT / "src"))

import enclosure_rear_bay_concept as concept  # noqa: E402

ROLE_STYLE: dict[str, tuple[str, float]] = {
    "wood": ("#c9a77c", 1.0),
    "wet_panel": ("#e8ecef", 1.0),
    "nozzle": ("#4a4f55", 1.0),
    "nozzle_tip": ("#2b2f33", 1.0),
    "tray": ("#a9b0b7", 1.0),
    "cell_post": ("#7d858d", 1.0),
    "load_cell": ("#d0d4d8", 1.0),
    "platform": ("#f4f6f8", 1.0),
    "glass": ("#9fd3f0", 0.35),
    "shelf": ("#b8c2cb", 1.0),
    "shelf_dry": ("#b48f63", 1.0),
    "cart_body": ("#5d6670", 1.0),
    "cart_front_plate": ("#4d555e", 1.0),
    "cart_tube_panel": ("#7a848e", 1.0),
    "pumps": ("#1f2327", 1.0),
    "module_pcb": ("#2f8f4e", 1.0),
    "main_pcb": ("#2f8f4e", 1.0),
    "devkit": ("#1d3557", 1.0),
    "tube": ("#4fa3d9", 0.85),
    "tablet": ("#1c1d20", 1.0),
    "screen": ("#3a5a78", 1.0),
    "mount": ("#6b7580", 1.0),
}

MAX_EDGE_MM = 1e9
TESS_TOL_MM = 0.4


@dataclass
class Mesh:
    tris: np.ndarray  # (n, 3, 3)
    color: str
    opacity: float


def _subdivide(tris: np.ndarray) -> np.ndarray:
    for _ in range(5):
        e = np.max(
            np.stack(
                [
                    np.linalg.norm(tris[:, 0] - tris[:, 1], axis=1),
                    np.linalg.norm(tris[:, 1] - tris[:, 2], axis=1),
                    np.linalg.norm(tris[:, 2] - tris[:, 0], axis=1),
                ]
            ),
            axis=0,
        )
        big = e > MAX_EDGE_MM
        if not big.any():
            break
        t = tris[big]
        a, b, c = t[:, 0], t[:, 1], t[:, 2]
        ab, bc, ca = (a + b) / 2, (b + c) / 2, (c + a) / 2
        split = np.concatenate(
            [
                np.stack([a, ab, ca], 1),
                np.stack([ab, b, bc], 1),
                np.stack([ca, bc, c], 1),
                np.stack([ab, bc, ca], 1),
            ]
        )
        tris = np.concatenate([tris[~big], split])
    return tris


def load_meshes() -> dict[str, Mesh]:
    meshes: dict[str, Mesh] = {}
    for part in concept.scene():
        verts, faces = part.shape.tessellate(TESS_TOL_MM, 0.8)
        v = np.array([[p.X, p.Y, p.Z] for p in verts])
        tris = _subdivide(v[np.array(faces)])
        color, opacity = ROLE_STYLE[part.role]
        meshes[part.label] = Mesh(tris, color, opacity)
    return meshes


@dataclass
class View:
    title: str
    direction: tuple[float, float, float]  # camera looks along this vector
    hide: Callable[[str], bool] = lambda label: False
    section: tuple[tuple[float, float, float], float] | None = None  # keep p.n < offset
    labels: list[tuple[str, tuple[float, float, float], float, float]] = field(
        default_factory=list
    )
    dims: list[tuple[tuple[float, float, float], tuple[float, float, float], float, str]] = field(
        default_factory=list
    )


def _basis(d: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    up = np.array([0.0, 0.0, 1.0])
    right = np.cross(d, up)
    if np.linalg.norm(right) < 1e-6:
        right = np.array([1.0, 0.0, 0.0])
    right /= np.linalg.norm(right)
    u = np.cross(right, d)
    return right, u


SS = 2  # supersampling factor
BG = np.array([251, 250, 247], dtype=float)


def _raster_pass(
    tris2: np.ndarray, depth: np.ndarray, rgb: np.ndarray, zbuf: np.ndarray, color: np.ndarray,
    clipv: np.ndarray | None = None,
) -> None:
    """clipv: per-vertex signed distance to the section plane; keep pixels < 0."""
    h, w = zbuf.shape
    for i in range(len(tris2)):
        if clipv is not None and clipv[i].min() >= 0:
            continue
        (x0, y0), (x1, y1), (x2, y2) = tris2[i]
        minx, maxx = int(max(min(x0, x1, x2), 0)), int(min(max(x0, x1, x2) + 1, w))
        miny, maxy = int(max(min(y0, y1, y2), 0)), int(min(max(y0, y1, y2) + 1, h))
        if minx >= maxx or miny >= maxy:
            continue
        den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
        if abs(den) < 1e-9:
            continue
        px, py = np.meshgrid(np.arange(minx, maxx) + 0.5, np.arange(miny, maxy) + 0.5)
        a = ((y1 - y2) * (px - x2) + (x2 - x1) * (py - y2)) / den
        b = ((y2 - y0) * (px - x2) + (x0 - x2) * (py - y2)) / den
        c = 1 - a - b
        inside = (a >= -1e-6) & (b >= -1e-6) & (c >= -1e-6)
        if not inside.any():
            continue
        if clipv is not None:
            s = a * clipv[i, 0] + b * clipv[i, 1] + c * clipv[i, 2]
            inside &= s < 0
        z = a * depth[i, 0] + b * depth[i, 1] + c * depth[i, 2]
        zb = zbuf[miny:maxy, minx:maxx]
        hit = inside & (z < zb)
        zb[hit] = z[hit]
        color[miny:maxy, minx:maxx][hit] = rgb[i]


def _rasterize(batches, right, u, d, scale, ox, oy, w, h, section) -> str:
    import base64
    import struct
    import zlib

    zbuf = np.full((h, w), np.inf)
    color = np.tile(BG, (h, w, 1))
    opaque = [b for b in batches if b[2] >= 1]
    clear = [b for b in batches if b[2] < 1]
    for tris, rgb, opacity in opaque + clear:
        t2 = np.stack([(tris @ right) * scale + ox, -(tris @ u) * scale + oy], axis=-1)
        clipv = None
        if section is not None:
            normal, offset = section
            clipv = tris @ np.asarray(normal, dtype=float) - offset
        if opacity < 1:
            # Nearest transparent surface only, blended once over the opaque result.
            tmp_z = np.full((h, w), np.inf)
            tmp_color = color.copy()
            _raster_pass(t2, tris @ d, rgb, tmp_z, tmp_color, clipv)
            hit = tmp_z < zbuf
            color[hit] = color[hit] * (1 - opacity) + tmp_color[hit] * opacity
            continue
        _raster_pass(t2, tris @ d, rgb, zbuf, color, clipv)

    img = color.reshape(h // SS, SS, w // SS, SS, 3).mean(axis=(1, 3)).astype(np.uint8)
    raw = b"".join(b"\x00" + row.tobytes() for row in img)
    hh, ww = img.shape[:2]

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", ww, hh, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 6))
        + chunk(b"IEND", b"")
    )
    return base64.b64encode(png).decode()


def render_view(view: View, meshes: dict[str, Mesh], cell_w: float, cell_h: float) -> str:
    d = np.array(view.direction, dtype=float)
    d /= np.linalg.norm(d)
    right, u = _basis(d)
    light = -d + 0.6 * u - 0.35 * right
    light /= np.linalg.norm(light)

    batches = []  # (tris, rgb (n,3), opacity)
    for label, mesh in meshes.items():
        if view.hide(label):
            continue
        tris = mesh.tris
        n = np.cross(tris[:, 1] - tris[:, 0], tris[:, 2] - tris[:, 0])
        nl = np.linalg.norm(n, axis=1)
        ok = nl > 1e-9
        tris, n = tris[ok], n[ok] / nl[ok, None]
        facing = np.abs(n @ d) > 0.03  # drop edge-on slivers
        tris, n = tris[facing], n[facing]
        if len(tris) == 0:
            continue
        n[(n @ d) > 0] *= -1  # face the camera
        shade = 0.5 + 0.5 * np.clip(n @ light, 0, 1)
        base = np.array([int(mesh.color[i : i + 2], 16) for i in (1, 3, 5)], dtype=float)
        batches.append((tris, np.clip(shade[:, None] * base, 0, 255), mesh.opacity))

    allpts = np.concatenate([b[0].reshape(-1, 3) for b in batches])
    xs, ys = allpts @ right, -(allpts @ u)
    pad = 150.0
    scale = min((cell_w - 2 * pad) / np.ptp(xs), (cell_h - 2 * pad - 30) / np.ptp(ys))
    ox = (cell_w - np.ptp(xs) * scale) / 2 - xs.min() * scale
    oy = 40 + (cell_h - 40 - np.ptp(ys) * scale) / 2 - ys.min() * scale

    def proj(p: tuple[float, float, float]) -> tuple[float, float]:
        q = np.array(p, dtype=float)
        return (q @ right) * scale + ox, -(q @ u) * scale + oy

    img = _rasterize(
        batches, right, u, d, scale * SS, ox * SS, oy * SS, int(cell_w * SS), int(cell_h * SS),
        view.section,
    )
    out = [
        f'<image x="0" y="0" width="{cell_w:.0f}" height="{cell_h:.0f}" '
        f'href="data:image/png;base64,{img}"/>',
        f'<text x="{cell_w / 2:.0f}" y="26" text-anchor="middle" font-size="18" '
        f'font-weight="600">{view.title}</text>',
    ]

    for a, b, offset, text in view.dims:
        (x1, y1), (x2, y2) = proj(a), proj(b)
        vx, vy = x2 - x1, y2 - y1
        ln = max((vx * vx + vy * vy) ** 0.5, 1e-6)
        nx, ny = -vy / ln * offset, vx / ln * offset
        x1o, y1o, x2o, y2o = x1 + nx, y1 + ny, x2 + nx, y2 + ny
        out.append(
            f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x1o:.1f}" y2="{y1o:.1f}" stroke="#888" stroke-width="0.8"/>'
            f'<line x1="{x2:.1f}" y1="{y2:.1f}" x2="{x2o:.1f}" y2="{y2o:.1f}" stroke="#888" stroke-width="0.8"/>'
            f'<line x1="{x1o:.1f}" y1="{y1o:.1f}" x2="{x2o:.1f}" y2="{y2o:.1f}" stroke="#c0392b" '
            f'stroke-width="1.2" marker-start="url(#arr)" marker-end="url(#arr)"/>'
        )
        mx, my = (x1o + x2o) / 2 + nx * 0.25, (y1o + y2o) / 2 + ny * 0.25
        out.append(
            f'<text x="{mx:.1f}" y="{my:.1f}" text-anchor="middle" dominant-baseline="middle" '
            f'font-size="13" fill="#c0392b" stroke="#fff" stroke-width="3" paint-order="stroke">{text}</text>'
        )

    for text, anchor, dx, dy in view.labels:
        x, y = proj(anchor)
        tx, ty = x + dx, y + dy
        anchor_attr = "end" if dx < 0 else "start"
        out.append(
            f'<line x1="{x:.1f}" y1="{y:.1f}" x2="{tx:.1f}" y2="{ty:.1f}" stroke="#222" stroke-width="0.9"/>'
            f'<circle cx="{x:.1f}" cy="{y:.1f}" r="2.5" fill="#222"/>'
            f'<text x="{tx + (-4 if dx < 0 else 4):.1f}" y="{ty + 4:.1f}" text-anchor="{anchor_attr}" '
            f'font-size="13" stroke="#fff" stroke-width="3" paint-order="stroke">{text}</text>'
        )
    return "\n".join(out)


def build_views() -> list[View]:
    c = concept
    W, D, H = c.footprint_mm()
    t = c.SHELL_T_MM
    gy = c.GLASS_CENTER_Y_MM
    w2 = W / 2
    mid = [z + c.CART_H_MM / 2 for z in c.LEVEL_Z_MM]
    head_y = c.PUMP_REAR_Y_MM - 15
    lean = math.radians(c.TABLET_LEAN_DEG)
    tablet_s = c.TABLET_CRADLE_T_MM + c.TABLET_H_MM / 2
    tablet_mid = (0.0, c.TABLET_HINGE_Y_MM + tablet_s * math.sin(lean), c.TABLET_HINGE_Z_MM + tablet_s * math.cos(lean))
    hinge = (0.0, c.TABLET_HINGE_Y_MM, c.TABLET_HINGE_Z_MM)
    drawer_y = D + c.DRAWER_SHOWN_OPEN_MM
    board = (0.0, drawer_y - t - 4 - c.MAIN_PCB_D_MM / 2, t + c.DRAWER_TRAY_T_MM + c.STANDOFF_H_MM + 2)
    panel_z = (t + c.ELEC_BOX_TOP_Z_MM) / 2
    rocker = (c.ROCKER_X_MM, drawer_y + c.ROCKER_BEZEL_T_MM, panel_z)
    barrel = (c.BARREL_X_MM, drawer_y + c.BARREL_FLANGE_T_MM, panel_z)
    rail = (-(c.CART_W_MM / 2 + c.RAIL_CLEARANCE_MM + c.RAIL_W_MM / 2), D - 20, c.LEVEL_Z_MM[1] + c.RAIL_H_MM)

    exterior = View(
        "1. Exterior, front-right",
        (-0.9, 1.0, -0.45),
        labels=[
            ("Fire HD 8 kiosk", tablet_mid, -80, -150),
            (f"Pivot mount, tilts {c.TABLET_TILT_MIN_DEG:.0f}-{c.TABLET_TILT_MAX_DEG:.0f}°", (c.TABLET_HINGE_LEN_MM / 2 + 10, c.TABLET_HINGE_Y_MM, c.TABLET_HINGE_Z_MM), 150, -20),
            ("Hood: outlet tubes to nozzles", (w2, gy, c.HOOD_Z_MM + 25), 90, -10),
            ("Glass bay open front and both sides", (w2 - 10, gy, c.PLATFORM_TOP_Z_MM + 90), 70, 40),
            ("Drip tray, slides out front", (0, 2, t + 12), -60, 80),
            ("Four-high cartridge tower", (w2, D * 0.8, mid[3]), 70, -40),
        ],
    )
    rear = View(
        "2. Rear, exterior: cartridges slide in, pump heads protrude",
        (0.9, -1.0, -0.5),
        labels=[
            *[
                (f"Slot {s}, pumps {4 * i + 1}-{4 * i + 4}", (-60, head_y, mid[i]), -150, 10 - 5 * i)
                for i, s in enumerate(c.SLOT_NAMES)
            ],
            (f"Shell ends at block housing; heads stick out {c.PUMP_REAR_Y_MM - D:.0f} mm",
             (82, head_y, mid[2]), 120, -150),
            ("Main board on pull-out drawer (shown open)", board, 150, 110),
            (f"SW1 round rocker, Ø{c.ROCKER_BEZEL_D_MM:g} face", rocker, -90, 50),
            ("12 V inlet (5.5×2.1 plug)", barrel, -60, 100),
            ("Slot rails", rail, 120, -10),
            ("Inlet comb, labeled clips", (W / 2 - 8, D + c.INLET_COMB_D_MM, c.LEVEL_Z_MM[3] + 40), -40, -60),
        ],
    )
    cut_x = 40.0
    section = View(
        f"3. Side section at X = {cut_x:.0f} mm",
        (-1.0, 0.0, 0.0),
        section=((1.0, 0.0, 0.0), cut_x),
        labels=[
            ("Fire HD 8", tablet_mid, -90, -70),
            ("Pivot hinge + cradle", hinge, -90, -20),
            ("Glass", (0, gy, c.PLATFORM_TOP_Z_MM + 100), 20, 80),
            ("Load-cell bar on isolated post", (0, c.CELL_FIXED_Y_MM - 15, c.CELL_BOTTOM_Z_MM + 6), 20, 60),
            ("Drip tray", (0, 60, t + 12), -60, 30),
            ("Outlet chase", (0, c.DIVIDER_Y_MM + t + 12, mid[1]), -60, 0),
            ("Blind-mate Micro-Fit dock", (0, c.dock_center(2)[1] - 6, c.dock_center(2)[2]) if c.dock_center(2) else (0, c.CART_Y0_MM, mid[2]), 250, -60),
            ("Outlet unions per slot", (0, c.CART_Y0_MM - 5, c.LEVEL_Z_MM[0] + c.CART_H_MM - 10), -60, -30),
            ("Main board drawer, pulled out", board, 40, 40),
            ("Pump heads outside the shell", (0, head_y, mid[3]), -10, -110),
        ],
        dims=[
            ((0, 0, 0), (0, D, 0), 45, f"{D:.0f} shell"),
            ((0, 0, -40), (0, c.PUMP_REAR_Y_MM, -40), 45, f"{c.PUMP_REAR_Y_MM:.0f} with pump heads"),
            ((0, c.PUMP_REAR_Y_MM, 0), (0, c.PUMP_REAR_Y_MM, H), 45, f"{H:.0f} tall"),
            ((0, 0, c.PLATFORM_TOP_Z_MM), (0, 0, c.NOZZLE_TIP_Z_MM), -35,
             f"{c.NOZZLE_TIP_Z_MM - c.PLATFORM_TOP_Z_MM:.0f}"),
            ((0, 0, 0), (0, 0, c.HOOD_TOP_Z_MM), -85, f"{c.HOOD_TOP_Z_MM:.0f} hood"),
        ],
    )
    front = View(
        "4. Front elevation",
        (0.0, 1.0, 0.0),
        labels=[
            ("Open side", (-w2 + 5, 0, c.PLATFORM_TOP_Z_MM + 80), -60, -40),
            ("Open side", (w2 - 5, 0, c.PLATFORM_TOP_Z_MM + 80), 60, -40),
        ],
        dims=[
            ((-w2, 0, 0), (w2, 0, 0), 40, f"{W:.0f} wide"),
            ((-w2, 0, H), (-w2, 0, 0), 40, f"{H:.0f}"),
            ((-c.TABLET_W_MM / 2, 0, c.TABLET_TOP_Z_MM), (c.TABLET_W_MM / 2, 0, c.TABLET_TOP_Z_MM), -20,
             f"Fire HD 8, {c.TABLET_W_MM:.0f} wide"),
        ],
    )
    return [exterior, rear, section, front]


def main() -> None:
    meshes = load_meshes()
    cell_w, cell_h = 900.0, 860.0
    views = build_views()
    W, D, H = concept.footprint_mm()
    sheet_w, sheet_h = 2 * cell_w, 2 * cell_h + 70

    def header(w: float, h: float) -> list[str]:
        return [
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:.0f}" height="{h:.0f}" '
            f'viewBox="0 0 {w:.0f} {h:.0f}" font-family="Helvetica, Arial, sans-serif">',
            '<defs><marker id="arr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" '
            'orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#c0392b"/></marker></defs>',
            f'<rect width="{w:.0f}" height="{h:.0f}" fill="#fbfaf7"/>',
        ]

    out = header(sheet_w, sheet_h)
    for i, view in enumerate(views):
        body = render_view(view, meshes, cell_w, cell_h)
        single = CAD_ROOT / "out" / f"enclosure_rear_bay_view{i + 1}.svg"
        single.parent.mkdir(parents=True, exist_ok=True)
        single.write_text("\n".join([*header(cell_w, cell_h), body, "</svg>"]) + "\n", encoding="utf-8")
        gx, gy = (i % 2) * cell_w, (i // 2) * cell_h
        out.append(f'<g transform="translate({gx:.0f},{gy:.0f})">')
        out.append(
            f'<rect x="6" y="6" width="{cell_w - 12:.0f}" height="{cell_h - 12:.0f}" '
            'fill="none" stroke="#ddd"/>'
        )
        out.append(body)
        out.append("</g>")
    note = (
        f"Rumtime rear-bay concept, shell about {W:.0f} W x {D:.0f} D x {H:.0f} H mm; pump heads protrude to {concept.PUMP_REAR_Y_MM:.0f} mm deep. "
        f"Real four-pump block and pump envelopes; cartridge {concept.CART_W_MM:.0f} x {concept.CART_D_MM:.0f} x "
        f"{concept.CART_H_MM:.0f} mm. Assumed: 12 mm ply, collins glass, Fire HD 8 (2022) without case, external 12 V brick. Massing study."
    )
    out.append(
        f'<text x="{sheet_w / 2:.0f}" y="{sheet_h - 28:.0f}" text-anchor="middle" font-size="15" fill="#444">{note}</text>'
    )
    out.append("</svg>")

    path = CAD_ROOT / "out" / "enclosure_rear_bay_concept.svg"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"Wrote {path}")


if __name__ == "__main__":
    main()
