import { describe, expect, it } from 'vitest';

import type { Recipe } from '@/api/types';
import { DEFAULT_ANTI_DRIP_MS, DEFAULT_ML_PER_SECOND } from '@/api/types';
import { estimateRecipePourDurationMs } from '@/lib/pour-progress';

const recipe: Recipe = {
  id: 'old-fashioned',
  name: 'Old Fashioned',
  categories: ['whiskey'],
  description: 'test',
  ingredients: [
    { id: 'bourbon', name: 'Bourbon', kind: 'pumped', ml: 45 },
    { id: 'simple', name: 'Simple syrup', kind: 'pumped', ml: 10 },
  ],
};

describe('estimateRecipePourDurationMs', () => {
  it('sums pour time and anti-drip across pumped steps', () => {
    const ms = estimateRecipePourDurationMs(recipe, [
      {
        pumpId: 1,
        ingredientId: 'bourbon',
        mlPerSecond: 1.75,
        antiDripMs: 100,
      },
      {
        pumpId: 2,
        ingredientId: 'simple',
        mlPerSecond: 1.75,
        antiDripMs: 100,
      },
    ]);

    const expected =
      (45 / 1.75) * 1000 +
      100 +
      (10 / 1.75) * 1000 +
      100;
    expect(ms).toBeCloseTo(expected);
  });

  it('falls back to default calibration when pump rates are missing', () => {
    const ms = estimateRecipePourDurationMs(recipe, [
      { pumpId: 1, ingredientId: 'bourbon' },
      { pumpId: 2, ingredientId: 'simple' },
    ]);

    const expected =
      (45 / DEFAULT_ML_PER_SECOND) * 1000 +
      DEFAULT_ANTI_DRIP_MS +
      (10 / DEFAULT_ML_PER_SECOND) * 1000 +
      DEFAULT_ANTI_DRIP_MS;
    expect(ms).toBeCloseTo(expected);
  });
});
