import recipesJson from '@/data/recipes.json';
import { recipeCatalogSchema, type Recipe } from '@/api/types';

let catalog: Recipe[] = [];
let catalogError: string | null = null;

try {
  catalog = recipeCatalogSchema.parse(recipesJson);
} catch (error) {
  catalogError =
    error instanceof Error ? error.message : 'Recipe catalog is invalid';
  console.error('[kiosk] Failed to load recipes.json', error);
}

export function getRecipeCatalogError(): string | null {
  return catalogError;
}

export function getRecipes(): Recipe[] {
  return catalog;
}

export function getRecipeById(id: string): Recipe | undefined {
  return catalog.find((recipe) => recipe.id === id);
}
