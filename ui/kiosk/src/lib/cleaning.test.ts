import { describe, expect, it } from 'vitest';

import {
  cleaningPurposeLabel,
  ingredientSwapCopy,
  isCleaningPurpose,
  isContinuousDispensePurpose,
  lineCleaningBadgeLabel,
  needsExtraFlush,
  nextLineCleaningStatus,
  shouldPromptIngredientSwap,
  shouldPromptPrimeAfterAssign,
  skipsInventoryDeduction,
} from '@/lib/cleaning';

describe('needsExtraFlush', () => {
  it('flags sticky pumped ingredients', () => {
    expect(needsExtraFlush('simple')).toBe(true);
    expect(needsExtraFlush('bourbon')).toBe(false);
  });
});

describe('nextLineCleaningStatus', () => {
  it('advances through flush and sanitize', () => {
    expect(nextLineCleaningStatus('idle', 'flush')).toBe('flushed');
    expect(nextLineCleaningStatus('flushed', 'sanitize')).toBe('sanitized');
    expect(nextLineCleaningStatus('sanitized', 'drain')).toBe('done');
  });
});

describe('skipsInventoryDeduction', () => {
  it('skips inventory for cleaning and prime purposes', () => {
    expect(skipsInventoryDeduction('flush')).toBe(true);
    expect(skipsInventoryDeduction('verify')).toBe(false);
  });
});

describe('shouldPromptIngredientSwap', () => {
  it('skips prompt when assigning to an empty line', () => {
    expect(shouldPromptIngredientSwap(null, 'gin')).toBe(false);
  });

  it('prompts on any swap or unassign from a used line', () => {
    expect(shouldPromptIngredientSwap('bourbon', 'rye')).toBe(true);
    expect(shouldPromptIngredientSwap('bourbon', 'simple')).toBe(true);
    expect(shouldPromptIngredientSwap('vodka', null)).toBe(true);
  });
});

describe('shouldPromptPrimeAfterAssign', () => {
  it('prompts when assigning to an empty line', () => {
    expect(shouldPromptPrimeAfterAssign(null, 'gin')).toBe(true);
  });

  it('skips when line stays empty or ingredient changes', () => {
    expect(shouldPromptPrimeAfterAssign(null, null)).toBe(false);
    expect(shouldPromptPrimeAfterAssign('bourbon', 'rye')).toBe(false);
    expect(shouldPromptPrimeAfterAssign('bourbon', null)).toBe(false);
  });
});

describe('ingredientSwapCopy', () => {
  const nameFor = (id: string) => id;

  it('returns null when no prompt is needed', () => {
    expect(ingredientSwapCopy(1, null, 'gin', nameFor)).toBeNull();
  });

  it('uses clear-line copy when unassigning', () => {
    const copy = ingredientSwapCopy(1, 'bourbon', null, nameFor);
    expect(copy?.title).toBe('Clear line 1?');
    expect(copy?.cleanLabel).toBe('Clear line');
    expect(copy?.saveLabel).toBe('Unassign anyway');
  });

  it('always recommends cleaning on swap', () => {
    const copy = ingredientSwapCopy(2, 'bourbon', 'rye', nameFor);
    expect(copy?.title).toContain('Swap to rye');
    expect(copy?.description).toContain('Drain the old liquid');
    expect(copy?.cleanLabel).toBe('Start swap');
    expect(copy?.saveLabel).toBe('Assign without cleaning');
  });
});

describe('lineCleaningBadgeLabel', () => {
  it('returns operator-facing labels', () => {
    expect(lineCleaningBadgeLabel('idle')).toBe('Not cleaned');
    expect(lineCleaningBadgeLabel('flushed')).toBe('Flushed');
    expect(lineCleaningBadgeLabel('sanitized')).toBe('Sanitized');
    expect(lineCleaningBadgeLabel('done')).toBe('Clean');
  });
});

describe('cleaning purpose helpers', () => {
  it('identifies cleaning and continuous dispense purposes', () => {
    expect(isCleaningPurpose('flush')).toBe(true);
    expect(isCleaningPurpose('calibration')).toBe(false);
    expect(isContinuousDispensePurpose('prime')).toBe(true);
    expect(isContinuousDispensePurpose('verify')).toBe(false);
  });

  it('returns operator-facing purpose labels', () => {
    expect(cleaningPurposeLabel('flush')).toBe('Flushing line…');
    expect(cleaningPurposeLabel('sanitize')).toBe('Running sanitizer…');
    expect(cleaningPurposeLabel('drain')).toBe('Draining line…');
  });
});
