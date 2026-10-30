# Four-pump block enclosure

Fit-test enclosure for one horizontal row of four **Kamoer KPHM100-HB-B10**
pumps. Build two identical blocks for the eight-pump bench/bar-cart setup.

**Status:** Fixed-floor shell with flat top sliding tube panel. Coupon print
feedback **2026-07-19** ([session 05](../../../docs/bench-results/2026-07-19-session-05.md)):
mount hole pattern **pass**; walls thinned to **2 mm**; central opening **Ø32**;
screw holes **Ø3.3**. Tube-clamp **silicone snap still pending**. Enclosure
layout dims remain fit-test assumptions; the rear PCB keep-out is provisional.

## Coordinate system

- Units: **millimeters**
- **X** = left/right across the four pumps
- **Y** = front/rear; pump heads face toward **−Y**
- **Z** = bottom/top
- Enclosure body origin: center of the front-bottom edge

## Starting layout

| Parameter | Starting value | Confidence |
| --- | ---: | --- |
| Pump count | 4 | Selected |
| Pump center pitch | **55 mm** | Fit-test assumption |
| Pump center height | **29 mm** | Fit-test assumption |
| Sliding pump-panel size | **213 × 52.35 × 2 mm** | FDM fit-test assumption |
| Body width | **220 mm** | Derived from pitch, mount pattern, and margins |
| Core body depth | **75 mm** | Compact fixed-rear-PCB envelope |
| Printed body depth | **84.35 mm** | Side/bottom walls extend flush with panel channels |
| Interior cavity height | **48 mm** | Slim pump-limited envelope |
| Overall rim height | **54.35 mm** | Flush top edge above recessed tube panel |
| Fixed floor / wall thickness | **2 mm** | FDM starting value (thinned after coupon print) |
| Top tube-panel thickness | **2 mm** | FDM starting value (thinned after coupon print) |
| Top slider width | **216 mm** | FDM fit-test assumption |
| Line tubing | **3×5 mm** silicone (5 mm OD) | On hand (2×5 m rolls) |
| Print-bed limit | **300 × 300 × 350 mm** | Builder-provided |
| Buffered XY part limit | **280 × 280 mm** | Design target |

Pump X centers are **−82.5, −27.5, +27.5, +82.5 mm**. Use the **motor-side
mirrored** KPHM100 hole coordinates: motor-side X maps to enclosure X and
motor-side Y maps to enclosure Z.

### Z stack

| Band | Z range (mm) |
| --- | --- |
| Fixed floor | **0 – 2** |
| Interior cavity | **2 – 50** |
| Top tube panel | **50 – 52** |
| Top rim | **to 54.35** |

The 2 mm custom front panel occupies **Y=−7 to −5 mm** and **Z=2 to 54.35 mm**.
Side and bottom walls extend forward to **Y=−9.35 mm**. Each pump's integral
plate sits at **Y=−14 to −7 mm**. The floor is a continuous **2 mm** shell
bottom — it does not slide.

## Service construction

- Separate sliding front pump panel, fixed-floor body, and **top sliding tube
  panel**.
- Front panel mounts behind each integral plate using Ø3.3 mm clearance holes.
- The loaded front panel slides down two vertical U-channels (**1.25 mm** edge
  engagement, **0.35 mm** fit clearance) and rests on the fixed floor.
- The top tube panel enters from the rear through horizontal grooves
  (**1 mm** engagement, **0.35 mm** clearance). Groove lands sit outside the
  narrower pump-panel path so the front panel can still drop in from above.
- Rear wall ends **0.50 mm** below the tube-panel underside so the flat plate
  does not scrape during rear entry.
- Exposed body corners use **1 mm** fillets. Tube-panel and front-panel outline
  corners use **1.5 mm**. Vertical sliding bearing edges stay straight.

### Top tube panel

Flat **216 × ~78.65 × 2 mm** rear-entry slider. On the **top exterior**, four
curved horizontal press-fit clamps sit in a tight cluster above the rear
PCB / cable-exit zone (centered on X=0):

- Length **15 mm** along +Y (tube axis front/rear)
- Cavity **Ø5.15 mm**, top throat **3.9 mm**, wall **1.5 mm** (snap for 5 mm OD)
- Block height **4 mm** above the panel (open-top C)
- Cluster pitch **10 mm**; centers at **−15, −5, +5, +15 mm**
- Cluster at **Y=63 mm** (above the rear cable opening)
- Inter-clamp gaps filled solid so the four throats sit in one block
- Angled side ramps **8 mm** run on the outer ends of the cluster only

No underside trenches or shared liquid paths — tubes are retained only by the
exterior clamps.

### Assembly order

1. Slide the front pump panel down to the floor; mount pumps.
2. Route 3×5 mm tubes and press each retained line into its top-panel clamp.
3. Slide the top tube panel on.

Remove in reverse. Print the body floor-down, the front panel via
`four_pump_block_front_plate_print`, and the tube panel via
`four_pump_block_top_tube_panel_print` (flat down, clamps up).

- Pump heads and replaceable pump tubing remain accessible from the front.
- Rear/side cable openings must provide strain relief for 12 V and I2C wiring.
- Keep each ingredient on an independent tube path; this enclosure does not
  create a liquid manifold.
- Do not put ventilation openings in the top tube panel where bottle or tube
  drips can enter. Add rear/side ventilation only after thermal testing shows
  it is needed.

## Fixed rear PCB clearance

Use a simple **170 × 18 × 40 mm** keep-out box (X × +Y × +Z) until the
finished PCB STEP or measured outline is available. The **40 mm** vertical size
is only scaled to the slim cavity so clearance exports still build.

The PCB volume stands vertically behind the motors. It occupies
**Y=51.5–69.5 mm** and **Z=7–47 mm**, leaving:

- **8 mm** behind the 50.5 mm terminal envelope.
- **2.5 mm** between the PCB keep-out and inside rear wall.
- Clearance above the floor and below the top-panel datum.

No PCB mounting holes, bosses, or connector-specific cutouts are locked in this
revision.

## Still to verify

- Screw length, thread, and engagement through the **2 mm** panel into the
  approximate 6 mm pump blind holes (re-print mount coupon at current dims).
- Wire exit and strain relief; motor wires and rear shaft remain omitted.
- Printed clamp snap on real **5 mm OD** silicone — **pending**
  ([session 05](../../../docs/bench-results/2026-07-19-session-05.md)); coupon
  geometry looked good but silicone press not logged yet.
- Clearance needed to remove and reload pump-head tubing with adjacent pumps.
- Finished PCB outline, mounting holes, component heights, connector locations,
  and cable bend radii.
- Heat rise with four pumps and drivers operating inside the closed block.
- Printed panel-channel fit and enclosure tolerances for the selected filament
  and printer. Print `four_pump_block_front_channel_coupon` and check fit with
  an edge of `four_pump_block_mount_coupon` before the full body.
- Panel flex under four running pumps; add local ribs only if the 2 mm fit-test
  panel proves insufficient.

## Coupon results (2026-07-19)

| Coupon | Result |
| ------ | ------ |
| Mount hole pattern | **Pass** — lined up on pump |
| Central clearance (first print Ø33) | **Tightened to Ø32** after ~1 mm radial felt loose |
| Tube clamp cluster print | **Pass** — matches intent |
| Tube clamp silicone snap | **Pending** |
