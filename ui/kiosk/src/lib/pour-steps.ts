import type { PourPhaseCommand, PourStep, Recipe } from "@/api/types";

export type PourPhase = PourPhaseCommand;

/**
 * Resolve recipe pour phases for the device.
 * Explicit `phases` are config-driven. When omitted, each pumped ingredient is
 * its own sequential phase (preserves pre-phase pour order).
 */
export function pourPhasesFromRecipe(recipe: Recipe): PourPhase[] {
  const byId = new Map(
    recipe.ingredients
      .filter(
        (ingredient): ingredient is typeof ingredient & { kind: "pumped"; ml: number } =>
          ingredient.kind === "pumped" && ingredient.ml !== undefined,
      )
      .map((ingredient) => [ingredient.id, ingredient] as const),
  );

  if (recipe.phases && recipe.phases.length > 0) {
    return recipe.phases.map((phase) => ({
      steps: phase.ingredientIds.flatMap((id) => {
        const ingredient = byId.get(id);
        if (!ingredient) {
          return [];
        }
        return [{ ingredientId: id, ml: ingredient.ml }];
      }),
    }));
  }

  return [...byId.entries()].map(([id, ingredient]) => ({
    steps: [{ ingredientId: id, ml: ingredient.ml }],
  }));
}

/** Flatten phases to a step list (inventory checks, legacy callers). */
export function pourStepsFromRecipe(recipe: Recipe): PourStep[] {
  return pourPhasesFromRecipe(recipe).flatMap((phase) => phase.steps);
}
