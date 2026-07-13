import type { PumpSlot, Recipe } from '@/api/types';
import {
  estimatePourSeconds,
  resolvePumpCalibration,
} from '@/lib/calibration';
import { pourStepsFromRecipe } from '@/lib/pour-steps';

/** Estimated wall time for all pumped recipe steps (pour + anti-drip). */
export function estimateRecipePourDurationMs(
  recipe: Recipe,
  pumps: readonly PumpSlot[],
): number {
  let totalMs = 0;
  for (const step of pourStepsFromRecipe(recipe)) {
    const pump = pumps.find((p) => p.ingredientId === step.ingredientId);
    const { mlPerSecond, antiDripMs } = resolvePumpCalibration(pump ?? {});
    totalMs += estimatePourSeconds(step.ml, mlPerSecond) * 1000 + antiDripMs;
  }
  return totalMs;
}
