import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { grantSetupUnlock, hasSetupUnlock } from '@/lib/setup-unlock';

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

describe('setup unlock session', () => {
  beforeEach(() => {
    vi.stubGlobal('sessionStorage', createSessionStorageMock());
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('grants and reads unlock within TTL', () => {
    grantSetupUnlock();
    expect(hasSetupUnlock()).toBe(true);
  });

  it('expires after 15 minutes', () => {
    grantSetupUnlock();
    vi.advanceTimersByTime(15 * 60 * 1000 + 1);
    expect(hasSetupUnlock()).toBe(false);
  });
});
