# Cleaning and Food-Safety Notes

This is a home project design note, not a certification document. Verify all food-contact materials and follow sanitizer label instructions.

## Cleaning philosophy

The machine should be easy enough to clean that it actually gets cleaned.

V1 uses:

- Replaceable tubing.
- Individual liquid paths.
- No shared manifold.
- Warm-water flush after use.
- Sanitizer session workflow.
- Removable nozzle plate and drip tray.

## Ingredients by cleaning burden

| Ingredient type      | Cleaning burden | V1 handling                                      |
| -------------------- | --------------- | ------------------------------------------------ |
| Spirits              | Low             | Normal flush if changing ingredients or storing. |
| Liqueurs             | Medium          | Flush after session if sugary.                   |
| Simple syrup         | Medium-high     | Warm-water flush after session.                  |
| Grenadine            | Medium-high     | Warm-water flush after session; stains possible. |
| Fresh citrus         | Medium-high     | Session-only; flush and sanitize after use.      |
| Non-pulpy juice      | Medium-high     | Session-only preferred.                          |
| Pulpy juice          | High            | Avoid in v1.                                     |
| Dairy/cream          | High            | Avoid in v1.                                     |
| Coconut cream/purées | High            | Avoid in v1.                                     |
| Carbonated mixers    | Medium          | Manual top-off in v1.                            |

## Star San / sanitizer workflow

The builder has Star San available. Use it as a session sanitizer, not as a permanent plumbed reservoir.

Always follow the sanitizer manufacturer's label for dilution, contact time, and storage. Do not rely on old mixed sanitizer unless the label and test conditions support it.

Recommended workflow:

1. Remove ingredient pickup tubes from bottles.
2. Place pickup tubes in a jug of warm water.
3. Run each pump forward until the line visibly flushes clear.
4. Run extra warm water through syrup, grenadine, and juice lines.
5. Move pickup tubes to freshly mixed sanitizer.
6. Run each pump until sanitizer reaches the nozzle.
7. Allow required sanitizer contact time per label.
8. Drain/purge lines into waste.
9. Optionally reverse briefly to pull liquid away from nozzle tips.
10. Leave lines dry or mostly empty.

## Cleaning dock idea

Make a simple cleaning dock or jug lid that holds all pickup tubes at once.

Features:

- Holds 8-12 pickup tubes.
- Fits a common cleaning jug or bucket.
- Keeps tubes from falling out.
- Can be 3D printed.
- Can have labels matching pump numbers.

This makes cleaning much more likely to happen after a session.

## What reverse pumping should and should not do

Reverse pumping is useful for:

- Anti-drip behavior.
- Pulling liquid away from nozzle tips.
- Draining outlet-side tubing.
- Reducing mess before disconnecting tubes.

Reverse pumping should not:

- Send sanitizer back into ingredient bottles.
- Send dirty flush water into ingredient bottles.
- Replace a proper flush/sanitize cycle.

## Tubing replacement

Treat tubing as consumable.

Replace tubing when:

- It smells like old ingredients after cleaning.
- It becomes cloudy, cracked, stiff, or sticky.
- It shows visible residue that does not flush out.
- Pump accuracy drifts due to tubing wear.
- It has been used with fresh juice for many sessions.

## Nozzle and drip tray cleaning

The nozzle plate should be removable.

Clean after use:

- Wipe nozzle tips.
- Rinse removable nozzle/funnel parts.
- Empty and wash drip tray.
- Inspect syrup/juice nozzles for residue.

## Fresh juices

Fresh juices are session-only in v1.

Recommended practice:

- Connect fresh citrus/juice shortly before use.
- Keep juice cold before connecting.
- Flush lines after the session.
- Do not leave juice in tubing overnight.

## Fridge integration

Mini-fridge plumbing is deferred.

Reasons:

- Drilling a fridge can puncture refrigerant tubing.
- Condensation and sanitation need design attention.
- Tube pass-throughs and door seals can create mechanical issues.
- V1 should validate basic pumping and cleaning first.

Possible safer v2 approach:

- Use an existing drain hole, door-gasket pass-through, or known-safe panel.
- Keep pumps outside fridge if possible.
- Keep fresh ingredients in sealed containers inside fridge.
- Design tube routing for easy cleaning/removal.

## Food-contact material checklist

Before final build, verify:

- Tubing food-contact suitability.
- Pump-head tubing suitability if liquid contacts it.
- Fittings/nozzles food-contact suitability.
- Printed parts do not contact beverage unless made from appropriate material and finish.
- Adhesives/sealants near liquid path are appropriate.
- Metal parts in liquid path are stainless or otherwise suitable for acidic/sugary beverages.

## Electrical separation

Liquids and electronics must be physically separated.

Design for:

- Drip paths that do not run onto PCBs.
- A removable drip tray below wet parts.
- Electronics in a dry compartment.
- Strain relief on all tubing.
- Pump modules mounted so leaks are visible.
- No exposed mains wiring near wet areas.
