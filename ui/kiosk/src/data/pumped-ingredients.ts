import { getRecipes } from '@/data/load-recipes';

export type PumpedIngredientOption = {
  id: string;
  name: string;
};

/** TTB authorized retail sizes (27 CFR 5.203) — common home-bar formats. */
export const BOTTLE_SIZE_OPTIONS = [
  { ml: 375, label: '375 ml' },
  { ml: 750, label: '750 ml' },
  { ml: 1000, label: '1 L' },
  { ml: 1750, label: '1.75 L' },
] as const;

export type BottleSizeMl = (typeof BOTTLE_SIZE_OPTIONS)[number]['ml'];

export function formatBottleSize(ml: number): string {
  const match = BOTTLE_SIZE_OPTIONS.find((option) => option.ml === ml);
  return match?.label ?? `${ml} ml`;
}

export function isPresetBottleSize(ml: number): boolean {
  return BOTTLE_SIZE_OPTIONS.some((option) => option.ml === ml);
}

export function getPumpedIngredients(): PumpedIngredientOption[] {
  const byId = new Map<string, string>();

  for (const recipe of getRecipes()) {
    for (const ingredient of recipe.ingredients) {
      if (ingredient.kind === 'pumped') {
        byId.set(ingredient.id, ingredient.name);
      }
    }
  }

  return [...byId.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function formatIngredientId(id: string): string {
  return id.replace(/_/g, ' ');
}
