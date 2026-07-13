import type { PourJob, PumpJob, PumpJobPurpose } from '@/api/types';
import { isActivePourJob } from '@/lib/pour-job';

export type PumpPourTracker = {
  pending: boolean;
  seenRunning: boolean;
  cancelRequested: boolean;
};

export type PumpPourOutcome = 'running' | 'finished' | 'cancelled';

export type RecipePourOutcome = 'active' | 'complete' | 'cancelled' | 'error';

export function createPumpPourTracker(): PumpPourTracker {
  return { pending: false, seenRunning: false, cancelRequested: false };
}

export function resetPumpPourTracker(tracker: PumpPourTracker): void {
  tracker.pending = false;
  tracker.seenRunning = false;
  tracker.cancelRequested = false;
}

/** Call after a successful dispense POST and a fresh /status read. */
export function markPumpPourDispenseStarted(tracker: PumpPourTracker): void {
  tracker.pending = true;
}

/** Stable identity for ignoring a prior attempt's terminal still in /status. */
export function pourJobIdentityKey(job: PourJob): string {
  return `${job.recipeId}|${job.state}|${job.progress}|${job.stepLabel}`;
}

/**
 * Resolve recipe-pour outcome from /status job.
 * Accepts a matching terminal without requiring seenRunning (short pours),
 * but ignores a prior terminal still cached from before this attempt started.
 * Null after active is not auto-complete — pour-page treats that as lost.
 */
export function resolveRecipePourOutcome(
  tracker: PumpPourTracker,
  recipeId: string,
  job: PourJob | null | undefined,
  priorTerminalKey: string | null,
): RecipePourOutcome | null {
  if (!tracker.pending) return null;

  const matches = job != null && job.recipeId === recipeId;

  if (matches && isActivePourJob(job)) {
    return 'active';
  }

  if (
    matches &&
    (job.state === 'complete' ||
      job.state === 'cancelled' ||
      job.state === 'error')
  ) {
    if (
      !tracker.seenRunning &&
      priorTerminalKey !== null &&
      pourJobIdentityKey(job) === priorTerminalKey
    ) {
      return null;
    }
    return job.state;
  }

  return null;
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

  if (matches && job.state === 'complete') {
    return 'finished';
  }
  if (matches && job.state === 'cancelled') {
    return 'cancelled';
  }

  if (!tracker.seenRunning) return null;

  // Idle contract: job cleared from status after our run ended.
  if (!matches) {
    if (tracker.cancelRequested) return 'cancelled';
    if (job === null || job === undefined) return 'finished';
    return null;
  }

  return null;
}
