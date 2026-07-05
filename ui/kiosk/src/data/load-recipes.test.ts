import { describe, expect, it } from 'vitest';

import {
  getRecipeById,
  getRecipeCatalogError,
  getRecipes,
} from '@/data/load-recipes';

describe('recipe catalog', () => {
  it('loads a validated catalog without parse errors', () => {
    expect(getRecipeCatalogError()).toBeNull();
    expect(getRecipes().length).toBeGreaterThan(0);
  });

  it('looks up recipes by id', () => {
    const recipe = getRecipeById('old-fashioned');
    expect(recipe?.name).toBe('Old Fashioned');
    expect(getRecipeById('missing-drink')).toBeUndefined();
  });
});
