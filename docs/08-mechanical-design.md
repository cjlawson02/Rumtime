# Mechanical Design

## Overall form

Rumtime should look more like a finished countertop appliance than a raw prototype, while staying affordable.

Recommended construction:

- Wood outer shell for appearance and cost.
- 3D printed pump cartridges, brackets, and nozzle components.
- Acrylic, HDPE, or similar washable panels for wet-side surfaces.
- Removable drip tray.
- External bottles.

## Layout concept

```text
[Back / upper area]
Pump cartridges and inlet tube routing

[Middle front]
Clustered nozzle plate

[Bottom front]
Glass platform, optional load cell, drip tray

[Side or rear dry compartment]
ESP32, power distribution, PCBs, wiring
```

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

1. Buy or model the exact pump.
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

If using a load cell:

- Mechanically isolate the weighing platform from the enclosure.
- Prevent tubing or nozzle parts from touching the glass/platform during measurement.
- Add overload protection if possible.
- Make the top plate removable/washable.

## Drip tray

Required.

Good options:

- Small stainless tray.
- Removable plastic tray.
- 3D printed tray holder with washable insert.
- Grate or perforated top if desired.

The tray should be easy to remove without disturbing the load cell.

## Inlet panel and labeling

Each liquid line gets a **barbed inlet** on the machine panel with a **fixed label above the barb** (pump number + ingredient name).

Pickup tubes terminate in **labeled bottle stoppers** that fit common bottle openings. The stopper label must match the inlet label so swapping bottles is obvious.

Design the inlet panel for **up to 16 positions** even when only 8 are populated at first build.

## Bottle arrangement

Bottles are separate from the machine.

V1 options:

- Bottles behind machine.
- Bottles below machine.
- Bottles in a side crate/rack.
- Tubes bundled to an inlet panel.

Use inlet-panel labels and matching bottle-stopper labels so pump-to-bottle routing is obvious.

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
- Clean labeled inlet panel.
- Hidden electronics compartment.
- Uniform nozzle plate and drip tray.

## Mini fridge note

Do not integrate the mini fridge in v1.

For v2, prefer routing through an existing safe pass-through instead of drilling unknown fridge walls. Fridge integration should be treated as its own design project with condensation, cleaning, and tube routing requirements.
