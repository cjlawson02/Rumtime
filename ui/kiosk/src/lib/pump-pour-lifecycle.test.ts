import { describe, expect, it } from 'vitest';

import type { PumpJob } from '@/api/types';
import {
  createPumpPourTracker,
  markPumpPourDispenseStarted,
  resetPumpPourTracker,
  resolvePumpPourOutcome,
} from '@/lib/pump-pour-lifecycle';

const runningJob: PumpJob = {
  pumpId: 1,
  purpose: 'calibration',
  state: 'running',
  progress: 50,
  stepLabel: 'Calibration run…',
  durationSeconds: 25,
};

describe('resolvePumpPourOutcome', () => {
  it('returns null until the matching job runs', () => {
    const tracker = createPumpPourTracker();
    tracker.pending = true;

    expect(resolvePumpPourOutcome(tracker, 1, 'calibration', null)).toBeNull();
    expect(tracker.seenRunning).toBe(false);
  });

  it('marks running then finished when status clears to idle', () => {
    const tracker = createPumpPourTracker();
    tracker.pending = true;

    expect(resolvePumpPourOutcome(tracker, 1, 'calibration', runningJob)).toBe(
      'running',
    );
    expect(resolvePumpPourOutcome(tracker, 1, 'calibration', null)).toBe(
      'finished',
    );
  });

  it('treats idle status after cancel as cancelled', () => {
    const tracker = createPumpPourTracker();
    tracker.pending = true;
    tracker.cancelRequested = true;

    resolvePumpPourOutcome(tracker, 1, 'calibration', runningJob);
    expect(resolvePumpPourOutcome(tracker, 1, 'calibration', null)).toBe(
      'cancelled',
    );
  });

  it('still accepts a terminal complete snapshot before idle', () => {
    const tracker = createPumpPourTracker();
    tracker.pending = true;

    resolvePumpPourOutcome(tracker, 1, 'calibration', runningJob);
    expect(
      resolvePumpPourOutcome(tracker, 1, 'calibration', {
        ...runningJob,
        state: 'complete',
        progress: 100,
      }),
    ).toBe('finished');
  });

  it('does not treat a different active pump job as finished', () => {
    const tracker = createPumpPourTracker();
    tracker.pending = true;

    resolvePumpPourOutcome(tracker, 1, 'calibration', runningJob);
    expect(
      resolvePumpPourOutcome(tracker, 1, 'calibration', {
        ...runningJob,
        pumpId: 2,
      }),
    ).toBeNull();
  });

  it('resolves finished when dispense started but running was never polled', () => {
    const tracker = createPumpPourTracker();
    markPumpPourDispenseStarted(tracker);

    expect(resolvePumpPourOutcome(tracker, 1, 'calibration', null)).toBe(
      'finished',
    );
  });

  it('resolves cancelled from an explicit cancelled snapshot', () => {
    const tracker = createPumpPourTracker();
    tracker.pending = true;

    resolvePumpPourOutcome(tracker, 1, 'calibration', runningJob);
    expect(
      resolvePumpPourOutcome(tracker, 1, 'calibration', {
        ...runningJob,
        state: 'cancelled',
      }),
    ).toBe('cancelled');
  });

  it('clears tracker state on reset', () => {
    const tracker = createPumpPourTracker();
    tracker.pending = true;
    tracker.seenRunning = true;
    tracker.cancelRequested = true;

    resetPumpPourTracker(tracker);

    expect(tracker).toEqual(createPumpPourTracker());
  });
});
