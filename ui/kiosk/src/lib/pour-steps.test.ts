import { describe, expect, it } from 'vitest';

import type { Recipe } from '@/api/types';
import { pourStepsFromRecipe } from '@/lib/pour-steps';

const recipe: Recipe = {
  id: 'daiquiri',
  name: 'Daiquiri',
  categories: ['rum'],
  description: 'Classic rum sour',
  ingredients: [
    { id: 'rum', name: 'White rum', ml: 60, kind: 'pumped' },
    { id: 'lime', name: 'Lime juice', ml: 22, kind: 'manual' },
    { id: 'simple', name: 'Simple syrup', ml: 15, kind: 'pumped' },
    { id: 'soda', name: 'Soda', kind: 'manual' },
  ],
};

describe('pourStepsFromRecipe', () => {
  it('maps only pumped ingredients with ml to pour steps', () => {
    expect(pourStepsFromRecipe(recipe)).toEqual([
      { ingredientId: 'rum', ml: 60 },
      { ingredientId: 'simple', ml: 15 },
    ]);
  });

  it('returns an empty list when nothing is pumped', () => {
    const manualOnly: Recipe = {
      ...recipe,
      ingredients: [{ id: 'lime', name: 'Lime', kind: 'manual' }],
    };
    expect(pourStepsFromRecipe(manualOnly)).toEqual([]);
  });

  it('skips pumped lines missing ml', () => {
    const missingMl: Recipe = {
      ...recipe,
      ingredients: [{ id: 'rum', name: 'Rum', kind: 'pumped' }],
    };
    expect(pourStepsFromRecipe(missingMl)).toEqual([]);
  });
});
