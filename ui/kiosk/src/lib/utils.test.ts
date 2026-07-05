import { describe, expect, it } from 'vitest';

import { roundProgressPercent } from '@/lib/utils';

describe('roundProgressPercent', () => {
  it('rounds to the nearest whole percent', () => {
    expect(roundProgressPercent(33.4)).toBe(33);
    expect(roundProgressPercent(33.6)).toBe(34);
  });

  it('clamps below zero and above one hundred', () => {
    expect(roundProgressPercent(-5)).toBe(0);
    expect(roundProgressPercent(105)).toBe(100);
  });
});
