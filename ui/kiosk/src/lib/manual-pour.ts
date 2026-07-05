import type { ManualTiming, Recipe, RecipeIngredient } from '@/api/types';
import { formatVolumeMl } from '@/lib/volume';

/** Carbonated / top-off mixers added after the machine pour (v1 default). */
export const POST_POUR_MANUAL_IDS = new Set([
  'soda',
  'tonic',
  'ginger_beer',
  'lemon_lime_soda',
]);

export type PrePourStep =
  | { kind: 'ice' }
  | { kind: 'manual'; ingredient: RecipeIngredient };

export function manualIngredientTiming(
  ingredient: RecipeIngredient,
): ManualTiming {
  if (ingredient.kind !== 'manual') {
    throw new Error(`Expected manual ingredient, got ${ingredient.kind}`);
  }
  if (ingredient.when !== undefined) return ingredient.when;
  return POST_POUR_MANUAL_IDS.has(ingredient.id) ? 'after' : 'before';
}

export function manualIngredientsForTiming(
  recipe: Recipe,
  when: ManualTiming,
): RecipeIngredient[] {
  return recipe.ingredients.filter(
    (ingredient) =>
      ingredient.kind === 'manual' &&
      manualIngredientTiming(ingredient) === when,
  );
}

export function buildPrePourSteps(recipe: Recipe): PrePourStep[] {
  const steps: PrePourStep[] = [];
  if (recipe.needsIce) {
    steps.push({ kind: 'ice' });
  }
  for (const ingredient of manualIngredientsForTiming(recipe, 'before')) {
    steps.push({ kind: 'manual', ingredient });
  }
  return steps;
}

export function buildPostPourSteps(recipe: Recipe): RecipeIngredient[] {
  return manualIngredientsForTiming(recipe, 'after');
}

export function prePourStepLabel(step: PrePourStep): string {
  if (step.kind === 'ice') return 'Add ice';
  return step.ingredient.name;
}

function ingredientNameInSentence(name: string): string {
  if (!name) return name;
  return name.charAt(0).toLowerCase() + name.slice(1);
}

export function prePourStepInstruction(step: PrePourStep): string {
  if (step.kind === 'ice') {
    return 'Fill your glass with ice, then tap Done when ready.';
  }
  const { ingredient } = step;
  if (ingredient.ml !== undefined) {
    const name = ingredientNameInSentence(ingredient.name);
    return `Add ${formatVolumeMl(ingredient.ml)} of ${name} to the glass, then tap Done.`;
  }
  return `Add ${ingredient.name} to the glass, then tap Done.`;
}

export function postPourStepInstruction(ingredient: RecipeIngredient): string {
  if (ingredient.id === 'bitters') {
    return `Dash ${ingredient.name} on top, then tap Done.`;
  }
  if (POST_POUR_MANUAL_IDS.has(ingredient.id)) {
    if (ingredient.ml !== undefined) {
      const name = ingredientNameInSentence(ingredient.name);
      return `Top with ${formatVolumeMl(ingredient.ml)} of ${name}, then tap Done.`;
    }
    return `Top with ${ingredient.name}, then tap Done.`;
  }
  if (ingredient.ml !== undefined) {
    const name = ingredientNameInSentence(ingredient.name);
    return `Add ${formatVolumeMl(ingredient.ml)} of ${name}, then tap Done.`;
  }
  return `Add ${ingredient.name}, then tap Done.`;
}
