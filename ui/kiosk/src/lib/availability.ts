import type { Recipe, RecipeIngredient } from '@/api/types';
import type { DeviceStatus } from '@/api/types';
import { INVENTORY_RESERVE_ML } from '@/api/types';

export type AvailabilityIssue =
  | { type: 'unbound'; ingredient: RecipeIngredient }
  | { type: 'unprimed'; ingredient: RecipeIngredient }
  | { type: 'low_inventory'; ingredient: RecipeIngredient; neededMl: number };

export type DrinkAvailability = {
  available: boolean;
  issues: AvailabilityIssue[];
  manualItems: RecipeIngredient[];
};

function isIngredientBound(
  ingredientId: string,
  device: DeviceStatus,
): boolean {
  const pumps = device.pumps;
  if (pumps !== undefined && pumps.length > 0) {
    return pumps.some((pump) => pump.ingredientId === ingredientId);
  }
  return Boolean(device.bindings[ingredientId]);
}

function pumpedIssues(
  ingredient: RecipeIngredient,
  device: DeviceStatus,
): AvailabilityIssue[] {
  if (ingredient.kind !== 'pumped' || ingredient.ml === undefined) {
    return [];
  }

  const binding = device.bindings[ingredient.id];
  const bound = isIngredientBound(ingredient.id, device);
  if (!bound) {
    return [{ type: 'unbound', ingredient }];
  }
  if (binding.primed !== true) {
    return [{ type: 'unprimed', ingredient }];
  }

  const needed = ingredient.ml + INVENTORY_RESERVE_ML;
  if (binding.remainingMl < needed) {
    return [{ type: 'low_inventory', ingredient, neededMl: needed }];
  }

  return [];
}

export function getDrinkAvailability(
  recipe: Recipe,
  device: DeviceStatus,
): DrinkAvailability {
  const issues: AvailabilityIssue[] = [];
  const manualItems = recipe.ingredients.filter((i) => i.kind === 'manual');

  for (const ingredient of recipe.ingredients) {
    issues.push(...pumpedIssues(ingredient, device));
  }

  return {
    available: issues.length === 0,
    issues,
    manualItems,
  };
}

export function isPourBlocked(issues: AvailabilityIssue[]): boolean {
  return issues.length > 0;
}

export function lowInventoryIssues(
  issues: AvailabilityIssue[],
): Extract<AvailabilityIssue, { type: 'low_inventory' }>[] {
  return issues.filter(
    (issue): issue is Extract<AvailabilityIssue, { type: 'low_inventory' }> =>
      issue.type === 'low_inventory',
  );
}

export function refillButtonLabel(issues: AvailabilityIssue[]): string | null {
  const low = lowInventoryIssues(issues);
  if (low.length === 0) return null;
  if (low.length === 1) return `Refill ${low[0].ingredient.name}`;
  return 'Refill ingredients';
}

export function isInventoryBlocked(issues: AvailabilityIssue[]): boolean {
  return lowInventoryIssues(issues).length > 0;
}

export function unboundIssues(
  issues: AvailabilityIssue[],
): Extract<AvailabilityIssue, { type: 'unbound' }>[] {
  return issues.filter(
    (issue): issue is Extract<AvailabilityIssue, { type: 'unbound' }> =>
      issue.type === 'unbound',
  );
}

export function hasUnboundIssues(issues: AvailabilityIssue[]): boolean {
  return unboundIssues(issues).length > 0;
}

export function canShowRefillCta(blockingIssues: AvailabilityIssue[]): boolean {
  return (
    isInventoryBlocked(blockingIssues) && !hasUnboundIssues(blockingIssues)
  );
}

export function effectiveBlockingIssues(
  issues: AvailabilityIssue[],
  bypassInventory = false,
): AvailabilityIssue[] {
  if (!bypassInventory) return issues;
  return issues.filter((issue) => issue.type !== 'low_inventory');
}

export function firstBlockingMessage(
  issues: AvailabilityIssue[],
  bypassInventory = false,
): string | null {
  const blocking = effectiveBlockingIssues(issues, bypassInventory);
  if (blocking.length === 0) return null;
  return issueLabel(blocking[0]);
}

export function issueLabel(issue: AvailabilityIssue): string {
  switch (issue.type) {
    case 'unbound':
      return `${issue.ingredient.name} not connected`;
    case 'unprimed':
      return `${issue.ingredient.name} line must be primed`;
    case 'low_inventory':
      return `${issue.ingredient.name} low`;
  }
}

export function issueStatusChipLabel(issue: AvailabilityIssue): string {
  switch (issue.type) {
    case 'unbound':
      return 'Not connected';
    case 'unprimed':
      return 'Not primed';
    case 'low_inventory':
      return 'Needs refill';
  }
}

export type UnavailableRecipe = {
  recipe: Recipe;
  availability: DrinkAvailability;
};

export function partitionMenuRecipes(
  recipes: Recipe[],
  device: DeviceStatus,
): { available: Recipe[]; unavailable: UnavailableRecipe[] } {
  const available: Recipe[] = [];
  const unavailable: UnavailableRecipe[] = [];

  for (const recipe of recipes) {
    const availability = getDrinkAvailability(recipe, device);
    if (availability.available) {
      available.push(recipe);
    } else {
      unavailable.push({ recipe, availability });
    }
  }

  return { available, unavailable };
}
