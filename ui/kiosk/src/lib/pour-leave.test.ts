import { describe, expect, it } from 'vitest';

import { shouldCancelPourOnLeave } from '@/lib/pour-leave';

describe('shouldCancelPourOnLeave', () => {
  it('does not cancel during guest pre-steps before pour starts', () => {
    expect(shouldCancelPourOnLeave(null, 'old-fashioned')).toBe(false);
    expect(shouldCancelPourOnLeave(undefined, 'old-fashioned')).toBe(false);
  });

  it('cancels when pour was started but job is not yet in status', () => {
    expect(
      shouldCancelPourOnLeave(null, 'old-fashioned', {
        expectActivePour: true,
      }),
    ).toBe(true);
  });

  it('cancels only this recipe while pouring', () => {
    expect(
      shouldCancelPourOnLeave(
        { recipeId: 'old-fashioned', state: 'pouring', progress: 10, stepLabel: 'Pouring' },
        'old-fashioned',
      ),
    ).toBe(true);
  });

  it('does not cancel during device prompt — pour already finished', () => {
    expect(
      shouldCancelPourOnLeave(
        {
          recipeId: 'old-fashioned',
          state: 'prompt',
          progress: 50,
          stepLabel: 'Manual step',
          promptMessage: 'Add ice',
        },
        'old-fashioned',
      ),
    ).toBe(false);
  });

  it('does not cancel another recipe pour', () => {
    expect(
      shouldCancelPourOnLeave(
        { recipeId: 'margarita', state: 'pouring', progress: 10, stepLabel: 'Pouring' },
        'old-fashioned',
      ),
    ).toBe(false);
  });

  it('does not cancel terminal jobs for this recipe', () => {
    expect(
      shouldCancelPourOnLeave(
        { recipeId: 'old-fashioned', state: 'complete', progress: 100, stepLabel: 'Done' },
        'old-fashioned',
      ),
    ).toBe(false);
    expect(
      shouldCancelPourOnLeave(
        { recipeId: 'old-fashioned', state: 'cancelled', progress: 0, stepLabel: 'Cancelled' },
        'old-fashioned',
      ),
    ).toBe(false);
  });
});
