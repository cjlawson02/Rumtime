import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearPourInventoryBypass,
  consumePourInventoryBypass,
  grantPourInventoryBypass,
  peekPourInventoryBypass,
} from '@/lib/pour-inventory-bypass';

function createSessionStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

describe('pour inventory bypass', () => {
  beforeEach(() => {
    vi.stubGlobal('sessionStorage', createSessionStorageMock());
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('grants and consumes a one-time bypass for a recipe', () => {
    grantPourInventoryBypass('old-fashioned');

    expect(peekPourInventoryBypass('old-fashioned')).toBe(true);
    expect(consumePourInventoryBypass('old-fashioned')).toBe(true);
    expect(peekPourInventoryBypass('old-fashioned')).toBe(false);
  });

  it('does not reuse bypass after consumption', () => {
    grantPourInventoryBypass('old-fashioned');
    consumePourInventoryBypass('old-fashioned');

    expect(consumePourInventoryBypass('old-fashioned')).toBe(false);
  });

  it('expires after five minutes', () => {
    grantPourInventoryBypass('old-fashioned');
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);

    expect(consumePourInventoryBypass('old-fashioned')).toBe(false);
  });

  it('clears bypass explicitly', () => {
    grantPourInventoryBypass('old-fashioned');
    clearPourInventoryBypass('old-fashioned');

    expect(peekPourInventoryBypass('old-fashioned')).toBe(false);
  });
});
