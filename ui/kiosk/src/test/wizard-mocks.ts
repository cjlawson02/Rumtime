import { vi } from 'vitest';

import type { DeviceStatus, PumpJob } from '@/api/types';
import { createPumpPourTracker } from '@/lib/pump-pour-lifecycle';

export function createMockPumpDispenseSession() {
  const state = {
    error: null as string | null,
    starting: false,
  };
  const startRun = vi.fn().mockResolvedValue(undefined);
  const emergencyStop = vi.fn().mockResolvedValue(undefined);
  const stopRun = vi.fn().mockResolvedValue(undefined);
  const setError = vi.fn((message: string | null) => {
    state.error = message;
  });

  const closeWizard = vi.fn(
    (
      onOpenChange: (open: boolean) => void,
      resetLocalState?: () => void,
    ) => {
      onOpenChange(false);
      resetLocalState?.();
    },
  );

  return {
    get starting() {
      return state.starting;
    },
    get error() {
      return state.error;
    },
    setError,
    startRun,
    stopRun,
    emergencyStop,
    closeWizard,
    createTracker: () => createPumpPourTracker(),
    defaultTrackerRef: { current: createPumpPourTracker() },
    statusRef: { current: undefined as DeviceStatus | undefined },
    reset: () => {
      state.error = null;
      state.starting = false;
    },
  };
}

export const wizardPumpStatus: DeviceStatus = {
  connected: true,
  bindings: {
    bourbon: {
      ingredientId: 'bourbon',
      remainingMl: 750,
      bottleSizeMl: 750,
      primed: true,
    },
    simple: {
      ingredientId: 'simple',
      remainingMl: 500,
      bottleSizeMl: 750,
      primed: true,
    },
  },
  pumps: [
    {
      pumpId: 1,
      ingredientId: 'bourbon',
      mlPerSecond: 2,
      antiDripMs: 100,
    },
    {
      pumpId: 2,
      ingredientId: 'simple',
      mlPerSecond: 1.5,
      antiDripMs: 80,
    },
  ],
  pumpJob: null,
};

export function runningPumpJob(
  overrides: Partial<PumpJob> & Pick<PumpJob, 'pumpId' | 'purpose'>,
): PumpJob {
  return {
    state: 'running',
    progress: 40,
    stepLabel: 'Running…',
    continuous: false,
    ...overrides,
  };
}
