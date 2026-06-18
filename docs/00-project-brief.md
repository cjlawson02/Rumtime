# Rumtime Project Brief

## Goal

Build **Rumtime**, a modular home cocktail execution engine that can pump measured amounts of spirits, syrups, and non-pulpy mixers from external bottles into one fixed glass position.

Rumtime should be fun to build, reasonably clean-looking, and expandable without a full redesign.

## User priorities

Ranked priority from the planning discussion:

1. **Cost / best bang for buck**
2. Good enough repeatability
3. Clean enough for normal home use
4. Reasonable speed
5. Finished-looking appearance

The target budget for v1 is about **$500 max**, excluding liquor and ingredients.

## Scope for v1

Rumtime v1 should include:

- 6-8 pump capability, with **8 pumps as the recommended v1 build**.
- Electrical and physical design expandable to **10-12 pumps**, with **12 pumps as the design limit**.
- One reversible peristaltic pump per ingredient.
- Timed dispensing after calibration.
- Optional but recommended load cell under the glass.
- Bottle inventory tracking based on configured bottle size and dispensed usage.
- Clustered individual nozzles over one fixed glass position.
- Drip tray.
- Basic physical controls: pump power cutoff, start/cancel or equivalent, and status indication.
- Moderate cleaning workflow using water flush and sanitizer.
- Replaceable tubing.
- External bottles, not integrated bottle storage.

## Explicit non-goals for v1

Rumtime v1 should not include:

- Pumped carbonated mixers.
- Pulp-heavy juice support.
- Cream, coconut cream, purées, or other high-residue ingredients.
- Shared liquid manifold.
- Inline flow meters on every line.
- Permanent sanitizer tank.
- Permanent mini-fridge plumbing.
- True powered hot-swap module insertion/removal.
- Commercial-grade compliance or unattended public operation.

## Assumptions

- The builder can solder, use hot air, 3D print parts, and likely make custom PCBs.
- The builder may have access to laser cutting or CNC, but woodworking is preferred for the visible enclosure.
- Bottles are physically separate from the machine footprint.
- Pump modules will be within about 3 ft of the main controller.
- Noise is not a major concern.
- On/off pump control is acceptable, though the electronics may support PWM.
- A small amount of manual intervention is acceptable, especially for cleaning, fresh juices, garnishes, and carbonated top-offs.

## Success criteria

The v1 build is successful if it can:

1. Make common mixed drinks with 8 ingredients.
2. Hit good-enough pour accuracy after calibration.
3. Avoid obvious dripping, clogging, or flavor carryover during a normal session.
4. Flush and sanitize the liquid paths with moderate effort.
5. Track estimated ingredient inventory well enough to warn before a bottle runs dry.
6. Accept at least one more 4-pump module later without redesigning the whole system.
