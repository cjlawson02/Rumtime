# Plumbing and Fluid Path

## Core rule

Each ingredient gets its own complete liquid path:

```text
bottle -> pickup tube -> optional inlet connector -> peristaltic pump -> outlet tube -> individual nozzle -> glass
```

Do not combine ingredients before the glass.

## Liquid path layout

Recommended v1 layout:

```text
External bottle/jar
  -> weighted pickup tube or dropped tube
  -> optional bottle cap/collar for strain relief
  -> tube bundle to machine
  -> machine inlet panel
  -> 4-pump cartridge
  -> short outlet tube
  -> nozzle plate
  -> glass
```

## Bottle pickup options

### Option A: dropped-in tubes

This is the simplest v1 approach.

Pros:

- Cheapest.
- Works with many bottle sizes.
- Easy to move pickup tubes to a cleaning jug.
- No need to model caps for every bottle type.

Cons:

- Less polished.
- Tubes can move or float.
- Bottle openings are exposed.
- Harder to make party-proof.

### Option B: 3D printed bottle caps/adapters

A good later upgrade.

Pros:

- Cleaner appearance.
- Tubes are strain-relieved.
- Easier labeling.
- Reduces accidental spills.

Cons:

- Bottle threads vary.
- More CAD and printing work.
- Caps need to be cleaned too.

Recommended v1 compromise: start with dropped-in tubes, but design the machine inlet panel so bottle cap adapters can be added later without changing pump modules.

## Nozzle design

Use individual nozzles clustered over the glass.

Recommended features:

- One outlet per pump.
- Nozzles aimed toward the center of the glass.
- No shared liquid manifold.
- Removable nozzle plate for cleaning.
- Short outlet tubes after pumps to reduce retained volume.
- Enough spacing that sticky residue can be wiped.

A removable open funnel below the nozzle cluster is acceptable if it is easy to rinse and does not create hidden dead volume.

## Anti-drip behavior

Use pump reversal rather than valves.

Recommended sequence:

```text
run pump forward for dispense time
pause briefly
reverse pump for anti_drip_reverse_ms
stop
```

Start testing with short reverse times such as 200-800 ms. Too much reverse can de-prime the line and reduce accuracy on the next pour.

Store anti-drip reverse time per pump because syrup, spirits, and juice may behave differently.

## Ingredients and clogging risk

| Ingredient                 | V1 support         | Risk        | Notes                                                 |
| -------------------------- | ------------------ | ----------- | ----------------------------------------------------- |
| Vodka                      | Yes                | Low         | Easy to pump and clean.                               |
| Rum                        | Yes                | Low         | Dark/sweet rums may leave more residue than vodka.    |
| Gin                        | Yes                | Low         | Easy to pump and clean.                               |
| Whiskey                    | Yes                | Low         | Easy to pump and clean.                               |
| Tequila                    | Yes                | Low         | Easy to pump and clean.                               |
| Triple sec/orange liqueur  | Yes                | Low-medium  | Sugary; flush after session.                          |
| Vermouth                   | Yes                | Low-medium  | Treat as session/refrigerated ingredient once opened. |
| Simple syrup               | Yes                | Medium      | Sticky; flush with warm water after session.          |
| Grenadine                  | Yes                | Medium      | Sticky and colored; flush well.                       |
| Lime/lemon juice, strained | Yes, session-only  | Medium      | Acidic; flush after session.                          |
| Cranberry juice, no pulp   | Yes, session-only  | Medium      | Sugar residue; flush.                                 |
| Orange juice, no pulp      | Maybe/session-only | Medium-high | More residue than clear juices.                       |
| Pineapple juice, no pulp   | Maybe/session-only | Medium-high | Foams/residue; flush well.                            |
| Pulpy juices               | No for v1          | High        | Settles, dries, clogs nozzles/fittings.               |
| Cream/dairy                | No for v1          | High        | Sanitation and residue issue.                         |
| Coconut cream/purées       | No for v1          | High        | Thick, sticky, difficult to clean.                    |
| Carbonated soda/tonic/cola | Manual top-off     | Medium-high | Foams, goes flat, complicates cleaning.               |

## Carbonated mixers

V1 decision: do not pump carbonated mixers.

Instead, the recipe/UI should say:

```text
Dispense base cocktail.
Then top with soda water / tonic / cola / ginger beer manually.
```

This keeps the machine simpler and avoids flat/foamy drinks.

## Tubing selection

Use food-contact tubing matched to pump and fittings.

Important points:

- Verify tubing ID/OD before ordering fittings.
- Soft silicone tubing usually works well with barbed fittings.
- Push-to-connect fittings often work better with semi-rigid tubing than very soft silicone.
- Pump-head tubing may wear faster than straight tubing.
- Treat tubing as consumable.

## Fitting strategy

### Budget v1

Use:

- Hose barbs.
- Spring clamps or small hose clamps.
- Bulkhead barbs at machine inlet if desired.
- Simple removable nozzle plate.

### Cleaner upgrade

Add:

- Hose-barb quick disconnects on the machine inlet panel.
- Valved quick disconnects only where spill reduction is worth the cost.
- Labeled bottle-side tube harnesses.

## Dead volume

Minimize dead volume after the pump.

Reasons:

- Less dripping.
- Easier cleaning.
- Less retained juice/syrup.
- Faster priming.

Keep outlet tubes short and accessible.

## Priming

The software/hardware should support a prime mode per pump.

Recommended workflow:

1. Place pickup tube in ingredient bottle.
2. Run pump forward until liquid reaches nozzle (timed over **drip tray**; fill level is variable).
3. Mark line as primed in software.
4. Dispense only after primed, **or** use **flow-gated dispense** when pouring into a glass on the load cell (see [`06-flow-calibration-and-inventory.md`](06-flow-calibration-and-inventory.md)).

Inventory tracking may optionally subtract a small priming volume.

## Reverse drain

Back-pumping can help clean or drain lines, but avoid assuming it fully sanitizes the system.

Possible use cases:

- Pull liquid away from nozzle tips after pours.
- Drain line contents back toward source before disconnecting.
- Reduce dripping during storage.

Do not reverse contaminated cleaning solution back into ingredient bottles.
