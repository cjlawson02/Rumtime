# SW1 round rocker (rear panel)

**Source:** builder measurement, 2026-11-01, plus the seller listing. Bought on AliExpress 2026-06-18 from VoltSteed Pro Store: "ON Off Round Rocker Switches SPST 20mm Mini 12 Volt DC … 2 Pin", 5 pcs, $2.97, order ref 8211994997654039. KCD1-style round press-fit rocker (listing model YJ-SW019) for the main power cutoff (SW1).

## Measured

| Item | Value |
| --- | ---: |
| Bezel (face) diameter | **Ø22.7 mm** |
| Body diameter | **Ø18.7 mm** |
| Retention | Press fit; side spring clips on the body |

## From the listing (unverified)

| Item | Value | Note |
| --- | ---: | --- |
| Panel hole | **Ø20 mm** (0.787") | Body Ø18.7 plus the clips |
| Rating | 20 A at 12 V DC; 10 A at 120 V AC | Meets the ≥10 A DC requirement on paper |
| Function | SPST ON-OFF, 2 pins | Marked O / I |
| Terminals | 0.187" (4.8 mm) quick-connect, silver-plated brass | Crimp female spades; the board side is a 5.08 mm screw terminal |
| Overall size | about 23 × 17 × 17 mm | Axes not stated |

## Assumed (measure before cutting the panel)

| Item | CAD value | Note |
| --- | ---: | --- |
| Bezel proud of the panel | 4 mm | |
| Body depth behind the panel | 22 mm | Includes the terminals; the listing's 17 mm may exclude them |
| Clip latch panel thickness | ~1–3 mm | Typical for this style; clips only latch behind a thin panel |

## Mounting

- Press fit into the 12 mm wood face: the side clips act as friction, not a latch. Drill a Ø20 mm test hole in scrap and check that the switch holds when the paddle is pushed hard. If it is loose, try Ø19.5 mm. If it walks out, counterbore from inside (~Ø30 mm) to a **~2 mm** web so the clips latch.
- The DC rating must be **≥10 A at 12 V** ([`main-controller-spec.md`](../../kicad/main-controller-spec.md)). The listing claims 20 A at 12 V DC. Cheap switch ratings are often optimistic, but 2× margin over the 8.5 A GST120 is enough for the bench. Check the switch stays cool during Test 1.6 at full pump load.
