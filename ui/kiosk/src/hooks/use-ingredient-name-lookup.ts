import { useMemo } from 'react';

import {
  formatIngredientId,
  getPumpedIngredients,
} from '@/data/pumped-ingredients';

export function useIngredientNameLookup(): (id: string) => string {
  return useMemo(() => {
    const map = new Map<string, string>();
    for (const ingredient of getPumpedIngredients()) {
      map.set(ingredient.id, ingredient.name);
    }
    return (id: string) => map.get(id) ?? formatIngredientId(id);
  }, []);
}
