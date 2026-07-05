import { describe, expect, it } from 'vitest';

import type { PumpSlot } from '@/api/types';
import { findPumpSlot, sortPumpSlots } from '@/lib/pumps';

const pumps: PumpSlot[] = [
  { pumpId: 3, ingredientId: 'c', mlPerSecond: 1, antiDripMs: 0 },
  { pumpId: 1, ingredientId: 'a', mlPerSecond: 1, antiDripMs: 0 },
  { pumpId: 2, ingredientId: null, mlPerSecond: 1, antiDripMs: 0 },
];

describe('sortPumpSlots', () => {
  it('returns a copy sorted by pumpId', () => {
    const sorted = sortPumpSlots(pumps);
    expect(sorted.map((p) => p.pumpId)).toEqual([1, 2, 3]);
    expect(sorted).not.toBe(pumps);
    expect(pumps.map((p) => p.pumpId)).toEqual([3, 1, 2]);
  });
});

describe('findPumpSlot', () => {
  it('finds a pump by id', () => {
    expect(findPumpSlot(pumps, 2)?.ingredientId).toBeNull();
    expect(findPumpSlot(pumps, 1)?.ingredientId).toBe('a');
  });

  it('returns undefined when missing or pumps unset', () => {
    expect(findPumpSlot(pumps, 9)).toBeUndefined();
    expect(findPumpSlot(undefined, 1)).toBeUndefined();
    expect(findPumpSlot(null, 1)).toBeUndefined();
  });
});
