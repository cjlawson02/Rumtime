import { describe, expect, it } from 'vitest';

import {
  formatBottleSize,
  formatIngredientId,
  getPumpedIngredients,
  isPresetBottleSize,
} from '@/data/pumped-ingredients';

describe('pumped-ingredients helpers', () => {
  it('formats ingredient ids for display', () => {
    expect(formatIngredientId('triple_sec')).toBe('triple sec');
    expect(formatIngredientId('bourbon')).toBe('bourbon');
  });

  it('formats preset and custom bottle sizes', () => {
    expect(formatBottleSize(750)).toBe('750 ml');
    expect(formatBottleSize(1000)).toBe('1 L');
    expect(formatBottleSize(500)).toBe('500 ml');
  });

  it('detects preset bottle sizes', () => {
    expect(isPresetBottleSize(750)).toBe(true);
    expect(isPresetBottleSize(500)).toBe(false);
  });

  it('collects unique pumped ingredients from recipes', () => {
    const ingredients = getPumpedIngredients();

    expect(ingredients.length).toBeGreaterThan(0);
    expect(ingredients.some((entry) => entry.id === 'bourbon')).toBe(true);

    const ids = ingredients.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);

    const names = ingredients.map((entry) => entry.name);
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
  });
});
