# Flow Calibration and Inventory

This file describes measurement behavior. It is not a software implementation spec.

## Measurement decision

V1 uses timed dispensing based on per-pump calibration.

Inline flow meters are intentionally skipped in v1 because they add cost, cleaning burden, extra wet parts, and possible problems with syrup, bubbles, and pulsed peristaltic flow.

## Accuracy target

The selected target is **good enough** cocktail accuracy, not laboratory accuracy.

A practical v1 goal:

- Repeat common pours within roughly 5-10 ml during normal timed operation.
- Improve calibration or add scale-assisted sequential pouring later if this is not acceptable.

## Calibration model

Each pump/ingredient gets a calibrated flow rate:

```text
ml_per_second = measured_output_ml / run_time_seconds
```

Use that value for dispensing:

```text
run_time_seconds = target_ml / ml_per_second
```

Calibration should be per pump and preferably per ingredient type, because syrup and spirits may flow differently.

## Basic calibration procedure

Manual measuring cup method:

1. Put pickup tube in ingredient or water.
2. Prime line until liquid reaches nozzle.
3. Run pump for a fixed duration, such as 20-30 seconds.
4. Measure output volume in a graduated cylinder or measuring cup.
5. Compute and store ml/sec.
6. Repeat once or twice and average if desired.

Load-cell method:

1. Put a cup on the load-cell platform.
2. Tare the scale.
3. Prime the line.
4. Run pump for a fixed duration.
5. Measure mass increase.
6. Convert mass to approximate ml.
7. Store ml/sec.

For many cocktail ingredients, using 1 g approximately equal to 1 ml is good enough for calibration. If better accuracy is needed, store density per ingredient later.

## Priming state

Timed dispensing assumes the line is primed.

Track per pump:

```text
pump_id
primed true/false
last_primed_at
last_cleaned_at
```

Possible behavior:

- After cleaning or tube replacement, mark line unprimed.
- After a successful prime cycle, mark line primed.
- Do not run normal recipes with an unprimed line unless the user confirms.

## Anti-drip reverse

After each pour, reverse briefly to reduce nozzle drip.

Track per pump:

```text
anti_drip_reverse_ms
```

Start with a conservative value and tune per liquid.

Too little reverse: dripping.
Too much reverse: line partially de-primes and next pour is low.

## Simultaneous versus sequential dispensing

### Normal mode: simultaneous timed pouring

Pros:

- Faster.
- Good for parties.
- Good enough when pumps are calibrated.

Cons:

- Scale cannot tell which ingredient under-poured.
- Total final mass only gives a sanity check.

### Precision mode: sequential scale-assisted pouring

Pros:

- More accurate.
- Can stop each ingredient based on weight increase.
- Easier to detect a problem with a specific line.

Cons:

- Slower.
- More software complexity.
- Requires stable glass platform and tare.

V1 recommendation: support timed simultaneous operation first. Use scale-assisted calibration and sanity checks before attempting fully closed-loop sequential pours.

## Load cell uses

The load cell is optional but recommended.

Useful behaviors:

| Behavior                 | Description                                              |
| ------------------------ | -------------------------------------------------------- |
| Glass present            | Detect weight above threshold.                           |
| Ice handling             | Tare after user places glass plus ice.                   |
| Calibration              | Measure dispensed mass during calibration.               |
| No-flow detection        | Pump runs but weight does not increase enough.           |
| Final sanity check       | Compare expected drink volume/mass to measured increase. |
| Spill/overflow detection | Unexpected weight changes can stop operation.            |

## No-flow detection

A simple v1 no-flow check:

```text
if pump_has_run_for_minimum_time and scale_delta_is_too_small:
    stop operation
    mark pump as suspect/unprimed
    alert user
```

This works best during sequential calibration or when only one pump is running. During simultaneous pours, it can still detect total failure but cannot identify the specific failed pump.

## Bottle inventory tracking

Software-only tracking is acceptable.

Suggested fields:

```text
ingredient_name
pump_id
bottle_size_ml
remaining_ml
low_warning_ml
ml_per_second
primed
last_primed_at
last_cleaned_at
last_refilled_at
```

When a recipe is made:

```text
remaining_ml -= target_dispense_ml
```

When a bottle is changed/refilled:

```text
remaining_ml = configured_bottle_size_ml
primed = false or user_confirmed
```

## Inventory reserve

Do not assume the machine can extract every ml from a bottle.

Use a configurable dead-volume reserve:

```text
usable_volume_ml = bottle_size_ml - reserve_ml
```

Starting suggestions:

| Bottle size | Reserve warning |
| ----------: | --------------: |
|      375 ml |        40-60 ml |
|      750 ml |       75-100 ml |
|         1 L |      100-125 ml |

This accounts for pickup tube geometry, bottle shape, and priming uncertainty.

## Cleaning and inventory

Cleaning cycles should not subtract from ingredient inventory unless ingredient fluid is being intentionally wasted.

Possible states:

- Ingredient mode: subtract dispensed recipe volume.
- Prime mode: optionally subtract estimated prime waste.
- Water flush mode: do not subtract ingredient inventory.
- Sanitizer mode: do not subtract ingredient inventory.
- Drain mode: do not add liquid back to inventory unless intentionally designed and safe.

Do not reverse sanitizer or dirty line contents back into ingredient bottles.

## Calibration verification test

For each installed pump, after calibration:

1. Prime line.
2. Dispense 15 ml target three times.
3. Dispense 30 ml target three times.
4. Dispense 60 ml target three times.
5. Record actual output.
6. Decide whether the pump meets the selected good-enough tolerance.

If a pump fails:

- Check priming.
- Check tubing compression/kinks.
- Check supply voltage sag.
- Check nozzle restriction.
- Recalibrate with a longer calibration run.
- Replace pump/tubing if needed.
