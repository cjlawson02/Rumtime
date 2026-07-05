import type { PumpJob, PumpJobPurpose } from '@/api/types';

export type PumpPourTracker = {
  pending: boolean;
  seenRunning: boolean;
  cancelRequested: boolean;
};

export type PumpPourOutcome = 'running' | 'finished' | 'cancelled';

export function createPumpPourTracker(): PumpPourTracker {
  return { pending: false, seenRunning: false, cancelRequested: false };
}

export function resetPumpPourTracker(tracker: PumpPourTracker): void {
  tracker.pending = false;
  tracker.seenRunning = false;
  tracker.cancelRequested = false;
}

/** Call after a successful dispense POST so fast firmware clears are detected. */
export function markPumpPourDispenseStarted(tracker: PumpPourTracker): void {
  tracker.pending = true;
  tracker.seenRunning = true;
}

/** Resolve dispense outcome from /status pumpJob (idle = null after terminal). */
export function resolvePumpPourOutcome(
  tracker: PumpPourTracker,
  pumpId: number,
  purpose: PumpJobPurpose,
  job: PumpJob | null | undefined,
): PumpPourOutcome | null {
  if (!tracker.pending) return null;

  const matches =
    job !== null &&
    job !== undefined &&
    job.pumpId === pumpId &&
    job.purpose === purpose;

  if (matches && job.state === 'running') {
    tracker.seenRunning = true;
    return 'running';
  }

  if (!tracker.seenRunning) return null;

  if (matches && job.state === 'complete') {
    return 'finished';
  }
  if (matches && job.state === 'cancelled') {
    return 'cancelled';
  }

  // Idle contract: job cleared from status after our run ended.
  if (!matches) {
    if (tracker.cancelRequested) return 'cancelled';
    if (job === null || job === undefined) return 'finished';
    return null;
  }

  return null;
}
