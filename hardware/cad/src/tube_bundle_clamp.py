"""Back-to-back 2+2 tube bundle clamp (no base).

Two press-fit clamps on the top face, two mirrored on the bottom face,
with a solid spine between them. Outer wall, inter-hole web, and
back-to-back web share one thickness. Outer box corners are filleted;
circular cavity arcs are left sharp.

ref: refs/tube-bundle-clamp.md
ref: refs/four-pump-block.md
"""

from __future__ import annotations

from build123d import (
    Align,
    Axis,
    Box,
    BuildPart,
    Cylinder,
    Edge,
    GeomType,
    Locations,
    Mode,
    Part,
    fillet,
)

try:
    from .four_pump_block import (
        CLAMP_CAVITY_D_MM,
        CLAMP_THROAT_MM,
        CLAMP_WALL_T_MM,
    )
except ImportError:
    from four_pump_block import (
        CLAMP_CAVITY_D_MM,
        CLAMP_THROAT_MM,
        CLAMP_WALL_T_MM,
    )

# ref: refs/tube-bundle-clamp.md — overall envelope (X × Y × Z).
OVERALL_X_MM = 15.0
OVERALL_Y_MM = 5.0  # tube canal (short grip along tube axis)
OVERALL_Z_MM = 15.0

# One web thickness for outer wall, between holes, and between back-to-back faces.
WEB_MM = CLAMP_WALL_T_MM
FACE_PITCH_MM = CLAMP_CAVITY_D_MM + WEB_MM
TUBE_COUNT_PER_FACE = 2
FACE_H_MM = (OVERALL_Z_MM - WEB_MM) / 2
# Outer vertical-corner blend; limited by the 5 mm Y canal half-span.
CORNER_FILLET_R_MM = 1.0
SHELL_TOL_MM = 0.02


def _face_x_centers() -> tuple[float, ...]:
    first = -((TUBE_COUNT_PER_FACE - 1) * FACE_PITCH_MM) / 2
    return tuple(first + index * FACE_PITCH_MM for index in range(TUBE_COUNT_PER_FACE))


def _cavity_r() -> float:
    return CLAMP_CAVITY_D_MM / 2


def _axis_z_for_face(floor_z: float) -> float:
    """Center the tube circle in the face block — equal wall to spine and outer face."""
    return floor_z + FACE_H_MM / 2


def _validate() -> None:
    if CLAMP_THROAT_MM >= CLAMP_CAVITY_D_MM:
        raise ValueError("Tube clamp throat must be narrower than the clamp cavity")
    if abs(FACE_PITCH_MM - (CLAMP_CAVITY_D_MM + WEB_MM)) > 1e-9:
        raise ValueError("Face pitch must keep inter-hole web equal to WEB_MM")
    if WEB_MM != CLAMP_WALL_T_MM:
        raise ValueError("WEB_MM must match outer clamp wall for equal material")
    if FACE_H_MM <= 0:
        raise ValueError("Face height must be positive")
    if abs(OVERALL_Z_MM - (2 * FACE_H_MM + WEB_MM)) > 1e-9:
        raise ValueError("Overall Z must equal two face blocks plus spine web")

    centers = _face_x_centers()
    outer_r = _cavity_r() + CLAMP_WALL_T_MM
    min_width = (centers[-1] - centers[0]) + 2 * outer_r
    if min_width > OVERALL_X_MM + 1e-9:
        raise ValueError("Clamp pair does not fit in the target X envelope")
    max_fillet = min(OVERALL_X_MM, OVERALL_Y_MM, OVERALL_Z_MM) / 2 - 0.05
    if CORNER_FILLET_R_MM > max_fillet:
        raise ValueError("Corner fillet exceeds the smallest envelope half-span")
    wall_z = FACE_H_MM / 2 - _cavity_r()
    if wall_z <= 0:
        raise ValueError("Cavity does not fit in the face block with centered axis")


def _on_bounding_shell(point, bb, tol: float = SHELL_TOL_MM) -> bool:
    return (
        abs(point.X - bb.min.X) < tol
        or abs(point.X - bb.max.X) < tol
        or abs(point.Y - bb.min.Y) < tol
        or abs(point.Y - bb.max.Y) < tol
        or abs(point.Z - bb.min.Z) < tol
        or abs(point.Z - bb.max.Z) < tol
    )


def _is_box_corner_vertex(point, bb, tol: float = SHELL_TOL_MM) -> bool:
    return (
        abs(abs(point.X) - bb.max.X) < tol
        and abs(abs(point.Y) - bb.max.Y) < tol
        and abs(abs(point.Z) - bb.max.Z) < tol
    )


def _outer_corner_edges(part: Part) -> list[Edge]:
    """Straight outer-shell edges that meet a box corner — not cavity circles."""
    bb = part.bounding_box()
    outer: list[Edge] = []
    for edge in part.edges():
        if edge.geom_type == GeomType.CIRCLE:
            continue
        start, end = edge @ 0, edge @ 1
        if not (_on_bounding_shell(start, bb) and _on_bounding_shell(end, bb)):
            continue
        if _is_box_corner_vertex(start, bb) or _is_box_corner_vertex(end, bb):
            outer.append(edge)
    return outer


def _fillet_outer_corners(clip: BuildPart) -> None:
    outer = _outer_corner_edges(clip.part)
    if outer:
        fillet(outer, radius=CORNER_FILLET_R_MM)


def _subtract_face_pair(*, floor_z: float, open_up: bool) -> None:
    """Cut two press-fit throats into one face of the envelope."""
    cavity_r = _cavity_r()
    axis_z = _axis_z_for_face(floor_z)
    throat_align = (Align.CENTER, Align.CENTER, Align.MIN if open_up else Align.MAX)

    for clamp_x in _face_x_centers():
        with Locations((clamp_x, 0, axis_z)):
            Cylinder(
                radius=cavity_r,
                height=OVERALL_Y_MM + 2,
                rotation=(90, 0, 0),
                align=(Align.CENTER, Align.CENTER, Align.CENTER),
                mode=Mode.SUBTRACT,
            )
        with Locations((clamp_x, 0, axis_z)):
            Box(
                CLAMP_THROAT_MM,
                OVERALL_Y_MM + 2,
                FACE_H_MM,
                align=throat_align,
                mode=Mode.SUBTRACT,
            )


def build_clamp() -> Part:
    """Back-to-back 2+2 clip, 15 × 5 × 15 mm envelope."""
    _validate()

    with BuildPart() as clip:
        Box(
            OVERALL_X_MM,
            OVERALL_Y_MM,
            OVERALL_Z_MM,
            align=(Align.CENTER, Align.CENTER, Align.CENTER),
        )
        _subtract_face_pair(floor_z=WEB_MM / 2, open_up=True)
        _subtract_face_pair(floor_z=-WEB_MM / 2 - FACE_H_MM, open_up=False)
        _fillet_outer_corners(clip)

    return clip.part


def build_clamp_print() -> Part:
    """Stand the clip on a Y end so both throats are side-facing for FDM."""
    part = build_clamp()
    oriented = part.rotate(Axis.X, -90)
    bb = oriented.bounding_box()
    return oriented.translate((-bb.min.X, -bb.min.Y, -bb.min.Z))
