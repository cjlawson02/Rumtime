# Mechanical Design

## Builder tooling

| Tool | Role |
| ---- | ---- |
| **Onshape** | Assembly review, cartridge layout, STEP import. **Bench brackets:** build123d in [`hardware/cad/src/`](../hardware/cad/) per locked workflow — not parametric source for those parts. |
| **build123d** (`hardware/cad/src/`) | Parametric brackets, coupons, scale platform — git source of truth; export STL/STEP via `scripts/export.py`. |
| **FDM 3D printer** | Iterate printed structure (pump mounts, clips, nozzles, cleaning dock). Not for direct beverage contact unless material/finish is explicitly chosen. |

## Overall form

Rumtime should look more like a finished countertop appliance than a raw prototype, while staying affordable.

Recommended construction:

- Wood outer shell for appearance and cost.
- 3D printed pump cartridges, brackets, and nozzle components.
- Acrylic, HDPE, or similar washable panels for wet-side surfaces.
- Removable drip tray.
- External bottles.

## Layout concept

**Draft accepted 2026-11-01.** Massing model: [`hardware/cad/src/enclosure_rear_bay_concept.py`](../hardware/cad/src/enclosure_rear_bay_concept.py) (render: `scripts/render_enclosure_concept_svg.py`; export: `scripts/export.py enclosure_rear_bay_concept`). The model's constants and `_validate()` are the source for the numbers below. Wood thickness (12 mm ply) and glass (collins Ø95 × 160) are assumptions, not locked.

```text
            [Fire HD 8 on pivot mount]
 [Hood: nozzles]   |  [Tower: slots D, C, B, A  ->  pump heads out the back]
 [Open glass bay]  |  [Outlet chase between bay and tower]
 [Tray + scale]    |  [Electronics bay under slot A: board drawer pulls out the back]
   front                                                        rear
```

| Zone | Draft size / rule |
| --- | --- |
| Overall | **284 W × 266 D × 409 H mm** shell; pump heads protrude to **298 mm** deep; tablet top **≤ 457 mm** (18 in under wall cabinets) |
| Pour bay | **140 mm** deep, open front and both sides; platform to nozzle tip **185 mm** |
| Tower | Four slots stacked at **84.5 mm** pitch (68.5 mm cartridge + 6 mm shelf + 10 mm tube-bend clearance) |
| Shell depth | Ends at the back of the four-pump-block housing; heads and tube sweeps stay outside |
| Outlet chase | **30 mm** between pour-bay wall and cartridges; outlet lines rise/fall here to the hood |
| Side channels | **20 mm** each side, dry Micro-Fit home-runs from the box to each slot |
| Electronics bay | Under slot A only, **50 mm** inner height. The main board rides on a **drawer** (≥110 mm travel) that pulls out the back for access; the drawer face is the rear panel with the **DC barrel jack** and **SW1 rocker** |
| Kiosk | Fire HD 8 in a cradle on a friction hinge at the hood front edge, **15–45°** tilt |

### Cartridge slot contract

- Envelope per slot: real four-pump block, **220 × 115.7 × 68.5 mm** including heads and tube sweeps ([`four-pump-block.md`](../hardware/cad/refs/four-pump-block.md)). Module PCB: [`4-pump-module-pcb.md`](../hardware/cad/refs/4-pump-module-pcb.md).
- Cartridges slide in from the **back** on two side **rails** per slot (4 mm wide, 10 mm tall, 0.5 mm clearance per side); heads face out the back for tube service.
- **Blind-mate bus:** each slot has a fixed Micro-Fit 2×3 cable plug (43025-0600) in a **floating dock bracket** at the slot front. The cartridge's J1 header mates as it seats; no hand plugging. Mate position comes from `four_pump_block.MICROFIT_FACE_CENTER_MM`. The dock cable runs down a side channel to its OUT on the main board. No daisy chain. **SW1 off before inserting or removing a cartridge**; slots are not hot-swap.
- Micro-Fit is not a blind-mate connector. Its latch locks, and it tolerates little misalignment. Plan to remove or relieve the latch ramp on the dock plug so a cartridge pulls free. Let the bracket float ±1 mm, and add a rear retention clip on the cartridge so it doesn't back out. Verify in Test 11.
- Each outlet line has a **barb union** at the slot's chase exit (four per slot) so a cartridge comes out without re-threading lines to the nozzle.
- Slot A = pumps 1–4 (lowest), D = 13–16. Put syrups and liqueurs in the lowest slots (least suction lift; see Bottle arrangement).

Service order: SW1 off → open the slot's four outlet unions → unclip its bottle lines from the inlet comb → release the retention clip → slide the cartridge out the back (the bus connector unmates on its own).

Main-board access: SW1 off → pull the drawer out the back. The dock and Kindle cables need a service loop at least as long as the drawer travel.

Main board: [`main-controller-pcb.md`](../hardware/cad/refs/main-controller-pcb.md) (76.7 × 51.1 mm, 4× M3 in a parallelogram; copy coordinates).

### Accepted risk: rear wet/dry stacking

The pump heads overhang the back directly above the electronics drawer face (barrel jack, SW1), with no drip catch. Accepted by the builder 2026-11-01 as low concern. This is a deliberate exception to "liquids and electronics physically separated" for the draft. Revisit if a head or line leaks on the bench.

### Rear panel power hardware

- **SW1:** round press-fit rocker on the drawer face (Ø22.7 mm face, Ø20 mm panel hole, listed 20 A at 12 V DC; AliExpress 2026-06-18, [`sw1-round-rocker.md`](../hardware/cad/refs/sw1-round-rocker.md)), wired to the board's SW1 landing. Test the press fit in scrap 12 mm wood first; counterbore to a ~2 mm web if it walks out. Rating must be **≥10 A DC** at 12 V per [`main-controller-spec.md`](../hardware/kicad/main-controller-spec.md); check the DC rating, not the AC one.
- **DC barrel jack:** panel-mount 5.5 mm jack, wired through the inline fuse to J1. A barrel fits the **GST60A12-P1J** (barrel plug). The **GST120A12-R7B** has a **4-pin DIN** plug, so with that brick use a matching panel DIN socket or cut and re-terminate. Common 5.5 × 2.1 jacks are rated ~5 A. For GST120 currents (up to ~8.7 A worst case), use a jack rated **≥10 A** or the DIN socket. **Builder choice (2026-11-01):** the intake is the 5.5 × 2.1 screw-terminal female plug on hand (AliExpress 2026-06-18, [`dc-inlet-plug.md`](../hardware/cad/refs/dc-inlet-plug.md)) in a printed holder. It is listed at only **2 A max**, so it must pass the heat test (Test 11.7) before the enclosure build. Fallback: cut the PSU plug and hardwire into J1 through a strain relief.

### Kiosk tablet mount

- Cradle with a front lip (stays inside the bottom bezel) and a back plate, pivoting on a hinge along the hood's front edge.
- Tilt **15–45°** from vertical. The 15° stop keeps the top under an 18 in cabinet; at 45° the tablet still clears the tower.
- Use **rated torque hinges** (≈0.5 N·m total) or a detent/ratchet. Tablet weight alone needs ~0.17 N·m at 45°; taps need margin.
- Route the USB-C charge cable along the hood top to a side channel, not down through the wet hood.

### Open checks before cutting wood

1. Slide a cartridge into a slot with tubes attached. Tubes must clear the **10 mm** gap under the shelf without kinking.
2. Print a nozzle-ring coupon. Sixteen 5 mm OD lines on the Ø36 mm ring leave **7.07 mm** pitch.
3. Load-cell noise with a full slot pumping (post shares the floor with the tower). See Test 7.6.
4. Restricted nozzle tip and per-slot anti-drip. Slot C/D pumps sit above the nozzle tip, so their outlet lines want to drain after a pour.

## Pump cartridges

Design each 4-pump module as a cartridge.

A cartridge should include:

- 4 pumps.
- 1 pump driver PCB.
- Pump motor wiring.
- Internal tube routing support.
- Mounting points.
- Labeling for pump numbers.
- Case/cover that leaves tubing serviceable.

The cartridge should be removable for service, but not unplugged while powered.

## Cartridge dimensions

Determine dimensions after selecting pumps. Before finalizing CAD:

1. Buy or model the exact pump — start with the measured **KPHM100 mount plate** in [`hardware/cad/refs/kphm100-mount-plate.md`](../hardware/cad/refs/kphm100-mount-plate.md).
2. Measure pump body, mounting holes, tubing path, and connectors.
3. Leave finger clearance for tube replacement.
4. Leave clearance for wiring and strain relief.
5. Print a one-pump or one-module fit test.

Do not finalize the enclosure before physical pump dimensions are verified.

## Nozzle plate

The nozzle plate should be:

- Removable.
- Labeled by pump/ingredient number.
- Easy to wipe.
- Designed without hidden dead volume.
- Positioned so all nozzles aim into the glass.

Recommended approach:

```text
3D printed or machined plate
8-12 individual nozzle holes
short outlet tubes terminate at plate
optional removable open funnel below
```

Avoid a closed shared funnel/manifold that is difficult to clean.

## Glass platform

Requirements:

- One fixed glass position.
- Stable enough for glass plus ice.
- Room for common cocktail glasses.
- Compatible with load cell if installed.
- Protected from spills.

Load cell geometry and bench layout: [`hardware/cad/refs/estardyn-load-cell.md`](../hardware/cad/refs/estardyn-load-cell.md) (**Estardyn 5 kg** + HX711). This unit is **75 mm**, **M4 tapped** (measured 2026-08-16). Bench Tests 7–9 use the printed cleat/pad cantilever, not the 110 mm product plates. Cantilever **printed and assembled** 2026-08-16; **not measured** yet.

If using a load cell (required for v1):

- **Mechanically isolate** the weighing platform from the enclosure and pump structure — required for flow-gated dispense, not optional tuning.
- Prevent tubing or nozzle parts from touching the glass/platform during measurement.
- Add overload protection if possible.
- Make the top plate removable/washable.
- Document isolation in bench results (photos, peak vibration noise from Test 7.6).

## Drip tray

Required.

Good options:

- Small stainless tray.
- Removable plastic tray.
- 3D printed tray holder with washable insert.
- Grate or perforated top if desired.

The tray should be easy to remove without disturbing the load cell.

## Inlet comb and labeling

With the open back there is no inlet panel. Each bottle line instead clips into a **rear inlet comb** on the back edge of each side wall before it reaches its pump head: two clips per slot per side, one per pump. The clip carries the **fixed label** (pump number + ingredient name) and takes bottle-line tugs so they never pull on the pump fitting.

Pickup tubes terminate in **labeled bottle stoppers** that fit common bottle openings. The stopper label must match the comb label so swapping bottles is obvious.

The combs have **16 positions** even when only 8 are populated at first build.

## Bottle arrangement

Bottles are separate from the machine.

V1 options:

- Bottles behind machine.
- Bottles below machine.
- Bottles in a side crate/rack.
- Tubes bundled to the rear inlet comb.

Use inlet-comb labels and matching bottle-stopper labels so pump-to-bottle routing is obvious.

**Suction lift (estimate, 2026-11-01).** These are calculations, not bench results. Kamoer publishes no suction-lift rating. The estimate uses laminar friction at the 1.75 ml/s bench flow in 3 mm ID line, with the tube 2 ft longer than the lift. Lift is measured from the bottle's liquid surface up to the pump. The pump inlets sit ~0.3 ft (slot A) to ~1.2 ft (slot D) above the counter.

| Liquid | Probably fine (≤10 kPa vacuum) | Likely trouble (~20 kPa, assumed) |
| --- | ---: | ---: |
| Spirits / water | 2.5 ft | 5 ft |
| Liqueur (~30% sugar) | 1.5 ft | 3 ft |
| 1:1 simple syrup | 0.3 ft | 1.5 ft |
| 2:1 rich syrup | none | none — friction alone exceeds full vacuum in 3 mm line |

The first failure is a quietly short timed pour, not a stall: the pump tube doesn't fully recover under vacuum, and spirits outgas. Bottles on the counter are fine except rich syrup. Bottles under the counter (3–4 ft) suit spirits only. Use 1:1 syrup at room temperature, or a wider, shorter pickup line. Verify with the suction-lift test in [`14-bench-test-protocol.md`](14-bench-test-protocol.md).

## Tube management

Recommended features:

- Tube bundle strain relief at machine inlet.
- Pump-number labels on both ends.
- Gentle bend radii.
- Avoid pinch points when cartridges are installed.
- Keep tubes accessible for cleaning and replacement.

## Enclosure materials

### Wood

Pros:

- Cheap.
- Looks good.
- Easy with woodworking tools.
- Good for outer shell.

Cons:

- Needs protection from spills.
- Not ideal for wet surfaces.

Use sealed wood for visible dry exterior surfaces.

### 3D printed parts

Pros:

- Great for pump mounts, tube clips, nozzles, and cleaning dock.
- Cheap iteration.
- Good for custom cartridge cases.

Cons:

- Layer lines can trap residue if used in wet path.
- Not ideal for direct beverage contact unless material/finish is carefully selected.

Use printed parts mainly for structure, not direct beverage contact.

### Acrylic/HDPE/washable plastic

Pros:

- Good wet-side panels.
- Easy to wipe.
- Can look clean.

Cons:

- Acrylic can crack if stressed.
- Requires appropriate fabrication methods.

## Service access

Design for maintenance:

- Pump cartridges accessible without dismantling the whole machine.
- Nozzle plate removable.
- Drip tray removable.
- Electronics accessible from dry side.
- Tubing replaceable without desoldering or cutting permanent parts.

## Visual finish ideas

Low-cost finished look:

- Wood side panels.
- Black or white printed pump cartridge covers.
- Clear acrylic front window over pump area if desired.
- Clean labeled inlet combs.
- Hidden electronics compartment.
- Uniform nozzle plate and drip tray.

## Mini fridge note

Do not integrate the mini fridge in v1.

For v2, prefer routing through an existing safe pass-through instead of drilling unknown fridge walls. Fridge integration should be treated as its own design project with condensation, cleaning, and tube routing requirements.
