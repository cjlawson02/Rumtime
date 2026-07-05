import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  isSetupPinLockSuspended,
  resetSetupPinLockSuspensionForTests,
  subscribeSetupPinLockSuspension,
  suspendSetupPinLock,
} from '@/lib/setup-pin-suspend';

describe('setup pin lock suspension', () => {
  afterEach(() => {
    resetSetupPinLockSuspensionForTests();
  });

  it('is inactive by default', () => {
    expect(isSetupPinLockSuspended()).toBe(false);
  });

  it('suspends while a hold is active', () => {
    const release = suspendSetupPinLock('calibration');
    expect(isSetupPinLockSuspended()).toBe(true);
    release();
    expect(isSetupPinLockSuspended()).toBe(false);
  });

  it('ref-counts duplicate holds for the same reason', () => {
    const releaseA = suspendSetupPinLock('wizard');
    const releaseB = suspendSetupPinLock('wizard');
    releaseA();
    expect(isSetupPinLockSuspended()).toBe(true);
    releaseB();
    expect(isSetupPinLockSuspended()).toBe(false);
  });

  it('notifies subscribers when suspension changes', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSetupPinLockSuspension(listener);

    const release = suspendSetupPinLock('pour');
    expect(listener).toHaveBeenCalledTimes(1);
    release();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
  });
});
