"""Measured Estardyn 5 kg load-cell bar envelope.

x = 0 at the load / arrow end face; +X toward the wire / fixed end.
+Y toward the front face (arrow and wires). +Z up; holes through +Z.

ref: refs/estardyn-load-cell.md
"""

from __future__ import annotations

from build123d import Align, Axis, Box, BuildPart, Compound, Cylinder, Locations, Mode

try:
    from ._dims import (
        BAR_HEIGHT_MM,
        BAR_HOLE_D_MM,
        BAR_LENGTH_MM,
        BAR_WIDTH_MM,
        LOAD_CELL_HOLE_CENTERS,
    )
except ImportError:
    from _dims import (
        BAR_HEIGHT_MM,
        BAR_HOLE_D_MM,
        BAR_LENGTH_MM,
        BAR_WIDTH_MM,
        LOAD_CELL_HOLE_CENTERS,
    )

BOOLEAN_OVERLAP_MM = 0.2
WIRE_D_MM = 2.0
WIRE_STUB_LEN_MM = 10.0


def build() -> Compound:
    """Return the measured bar plus a short wire stub at the fixed end."""
    hole_h = BAR_HEIGHT_MM + 2 * BOOLEAN_OVERLAP_MM

    with BuildPart() as bar:
        Box(
            BAR_LENGTH_MM,
            BAR_WIDTH_MM,
            BAR_HEIGHT_MM,
            align=(Align.MIN, Align.CENTER, Align.MIN),
        )
        with Locations(
            *[
                (hole.x, 0, -BOOLEAN_OVERLAP_MM)
                for hole in LOAD_CELL_HOLE_CENTERS
            ]
        ):
            Cylinder(
                radius=BAR_HOLE_D_MM / 2,
                height=hole_h,
                align=(Align.CENTER, Align.CENTER, Align.MIN),
                mode=Mode.SUBTRACT,
            )

    wire = Cylinder(
        radius=WIRE_D_MM / 2,
        height=WIRE_STUB_LEN_MM,
        align=(Align.CENTER, Align.CENTER, Align.MIN),
    ).rotate(Axis.Y, 90)
    wire = wire.translate(
        (BAR_LENGTH_MM, BAR_WIDTH_MM / 4, BAR_HEIGHT_MM / 2)
    )

    return Compound(children=[bar.part, wire])
