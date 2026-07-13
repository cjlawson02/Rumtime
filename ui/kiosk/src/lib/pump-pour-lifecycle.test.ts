import { describe, expect, it } from 'vitest';

import type { PourJob, PumpJob } from '@/api/types';
import {
  createPumpPourTracker,
  markPumpPourDispenseStarted,
  pourJobIdentityKey,
  resetPumpPourTracker,
  resolvePumpPourOutcome,
  resolveRecipePourOutcome,
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

  it('does not resolve finished from idle status immediately after dispense', () => {
    const tracker = createPumpPourTracker();
    markPumpPourDispenseStarted(tracker);

    expect(resolvePumpPourOutcome(tracker, 1, 'calibration', null)).toBeNull();
  });

  it('resolves finished from a complete snapshot without observing running', () => {
    const tracker = createPumpPourTracker();
    markPumpPourDispenseStarted(tracker);

    expect(
      resolvePumpPourOutcome(tracker, 1, 'calibration', {
        ...runningJob,
        state: 'complete',
        progress: 100,
      }),
    ).toBe('finished');
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

const cancelledPour: PourJob = {
  recipeId: 'gin-tonic',
  state: 'cancelled',
  progress: 0,
  stepLabel: 'Cancelled',
};

const completePour: PourJob = {
  recipeId: 'gin-tonic',
  state: 'complete',
  progress: 100,
  stepLabel: 'Done',
};

describe('resolveRecipePourOutcome', () => {
  it('ignores a prior terminal still in status until an active job appears', () => {
    const tracker = createPumpPourTracker();
    markPumpPourDispenseStarted(tracker);
    const priorKey = pourJobIdentityKey(cancelledPour);

    expect(
      resolveRecipePourOutcome(tracker, 'gin-tonic', cancelledPour, priorKey),
    ).toBeNull();

    expect(
      resolveRecipePourOutcome(
        tracker,
        'gin-tonic',
        {
          recipeId: 'gin-tonic',
          state: 'pouring',
          progress: 20,
          stepLabel: 'Pouring gin',
        },
        priorKey,
      ),
    ).toBe('active');
  });

  it('accepts complete without observing an active pour', () => {
    const tracker = createPumpPourTracker();
    markPumpPourDispenseStarted(tracker);

    expect(
      resolveRecipePourOutcome(tracker, 'gin-tonic', completePour, null),
    ).toBe('complete');
  });

  it('accepts a new terminal that differs from the prior-attempt snapshot', () => {
    const tracker = createPumpPourTracker();
    markPumpPourDispenseStarted(tracker);
    const priorKey = pourJobIdentityKey(cancelledPour);

    expect(
      resolveRecipePourOutcome(tracker, 'gin-tonic', completePour, priorKey),
    ).toBe('complete');
  });

  it('does not treat idle null as complete after an active pour', () => {
    const tracker = createPumpPourTracker();
    markPumpPourDispenseStarted(tracker);
    resolveRecipePourOutcome(
      tracker,
      'gin-tonic',
      {
        recipeId: 'gin-tonic',
        state: 'pouring',
        progress: 10,
        stepLabel: 'Pouring gin',
      },
      null,
    );

    expect(resolveRecipePourOutcome(tracker, 'gin-tonic', null, null)).toBeNull();
  });
});
