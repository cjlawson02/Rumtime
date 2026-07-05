export const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'whiskey', label: 'Whiskey' },
  { id: 'vodka', label: 'Vodka' },
  { id: 'gin', label: 'Gin' },
  { id: 'rum', label: 'Rum' },
  { id: 'tequila', label: 'Tequila' },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];

export function recipeMatchesCategory(
  categories: readonly string[],
  category: CategoryId,
): boolean {
  if (category === 'all') return true;
  return categories.includes(category);
}
