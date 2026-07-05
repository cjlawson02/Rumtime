import type { PourStep, Recipe } from '@/api/types';

/** Resolve pumped recipe lines to device pour steps (kiosk-owned catalog → opaque IDs). */
export function pourStepsFromRecipe(recipe: Recipe): PourStep[] {
  return recipe.ingredients
    .filter(
      (
        ingredient,
      ): ingredient is typeof ingredient & { kind: 'pumped'; ml: number } =>
        ingredient.kind === 'pumped' && ingredient.ml !== undefined,
    )
    .map((ingredient) => ({
      ingredientId: ingredient.id,
      ml: ingredient.ml,
    }));
}
