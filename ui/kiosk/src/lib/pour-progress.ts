import type { PumpSlot, Recipe } from "@/api/types";
import { estimatePourSeconds, resolvePumpCalibration } from "@/lib/calibration";
import { pourPhasesFromRecipe } from "@/lib/pour-steps";

/**
 * Estimated wall time for pumped pours (pour + anti-drip).
 * Concurrent steps within a phase use the phase max; phases sum in order.
 */
export function estimateRecipePourDurationMs(recipe: Recipe, pumps: readonly PumpSlot[]): number {
  let totalMs = 0;
  for (const phase of pourPhasesFromRecipe(recipe)) {
    let phaseMs = 0;
    for (const step of phase.steps) {
      const pump = pumps.find((p) => p.ingredientId === step.ingredientId);
      const { mlPerSecond, antiDripMs } = resolvePumpCalibration(pump ?? {});
      const stepMs = estimatePourSeconds(step.ml, mlPerSecond) * 1000 + antiDripMs;
      phaseMs = Math.max(phaseMs, stepMs);
    }
    totalMs += phaseMs;
  }
  return totalMs;
}
