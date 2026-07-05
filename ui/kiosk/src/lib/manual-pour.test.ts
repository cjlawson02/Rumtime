import { describe, expect, it } from 'vitest';

import { getRecipeById } from '@/data/load-recipes';
import {
  buildPostPourSteps,
  buildPrePourSteps,
  manualIngredientTiming,
  postPourStepInstruction,
  prePourStepInstruction,
} from '@/lib/manual-pour';

describe('manual-pour', () => {
  it('places ice first when recipe needs it', () => {
    const recipe = getRecipeById('moscow-mule');
    expect(recipe).toBeDefined();
    const steps = buildPrePourSteps(recipe!);
    expect(steps[0]).toEqual({ kind: 'ice' });
    expect(steps[1]).toMatchObject({ kind: 'manual', ingredient: { id: 'lime' } });
  });

  it('splits manual ingredients before and after the pour', () => {
    const recipe = getRecipeById('moscow-mule');
    expect(recipe).toBeDefined();

    expect(buildPrePourSteps(recipe!).map((step) => step.kind)).toEqual([
      'ice',
      'manual',
    ]);
    expect(buildPostPourSteps(recipe!).map((i) => i.id)).toEqual([
      'ginger_beer',
    ]);
  });

  it('defaults carbonated mixers to after-pour timing', () => {
    const recipe = getRecipeById('gin-tonic');
    expect(recipe).toBeDefined();
    const tonic = recipe!.ingredients.find((i) => i.id === 'tonic');
    expect(tonic).toBeDefined();
    expect(manualIngredientTiming(tonic!)).toBe('after');
  });

  it('formats guest instructions', () => {
    const recipe = getRecipeById('old-fashioned');
    expect(recipe).toBeDefined();
    const steps = buildPrePourSteps(recipe!);
    expect(steps).toEqual([{ kind: 'ice' }]);
    expect(prePourStepInstruction(steps[0])).toMatch(/ice/i);

    const bitters = buildPostPourSteps(recipe!)[0];
    expect(bitters.id).toBe('bitters');
    expect(postPourStepInstruction(bitters)).toBe(
      'Dash Angostura bitters on top, then tap Done.',
    );

    const margarita = getRecipeById('margarita');
    const limeStep = buildPrePourSteps(margarita!).find(
      (step) => step.kind === 'manual',
    );
    expect(limeStep).toBeDefined();
    expect(prePourStepInstruction(limeStep!)).toBe(
      'Add ~0.5 oz (15 ml) of fresh lime juice to the glass, then tap Done.',
    );

    const post = buildPostPourSteps(getRecipeById('amf')!);
    expect(postPourStepInstruction(post[0])).toBe(
      'Top with Sprite or 7-Up, then tap Done.',
    );
  });

  it('uses explicit manual timing when provided', () => {
    const ingredient = {
      id: 'lime',
      name: 'Fresh lime juice',
      ml: 15,
      kind: 'manual' as const,
      when: 'before' as const,
    };
    expect(manualIngredientTiming(ingredient)).toBe('before');
  });

  it('throws when manual timing is requested for a pumped ingredient', () => {
    expect(() =>
      manualIngredientTiming({
        id: 'rum',
        name: 'Rum',
        ml: 45,
        kind: 'pumped',
      }),
    ).toThrow(/manual ingredient/i);
  });

  it('formats pre-pour manual steps without ml', () => {
    const step = {
      kind: 'manual' as const,
      ingredient: {
        id: 'mint',
        name: 'Mint leaves',
        kind: 'manual' as const,
      },
    };
    expect(prePourStepInstruction(step)).toBe(
      'Add Mint leaves to the glass, then tap Done.',
    );
  });
});
