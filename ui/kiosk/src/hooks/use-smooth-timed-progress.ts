import { useEffect, useRef, useState } from 'react';

import type { PumpJob } from '@/api/types';
import { roundProgressPercent } from '@/lib/utils';

function getTimedDurationMs(
  pumpJob: PumpJob,
  mlPerSecond?: number,
): number | null {
  if (pumpJob.continuous) return null;
  if (pumpJob.durationSeconds !== undefined) {
    return pumpJob.durationSeconds * 1000;
  }
  if (
    pumpJob.targetMl !== undefined &&
    mlPerSecond !== undefined &&
    mlPerSecond > 0
  ) {
    return (pumpJob.targetMl / mlPerSecond) * 1000;
  }
  return null;
}

export function useSmoothTimedProgress(
  pumpJob: PumpJob | null | undefined,
  mlPerSecond?: number,
): number {
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const anchorRef = useRef<{ startedAt: number; durationMs: number } | null>(
    null,
  );
  const rafRef = useRef(0);

  const durationMs =
    pumpJob && pumpJob.state === 'running'
      ? getTimedDurationMs(pumpJob, mlPerSecond)
      : null;
  const isTimedRunning = durationMs !== null;

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    anchorRef.current = null;

    if (
      !pumpJob ||
      pumpJob.state === 'complete' ||
      !isTimedRunning
    ) {
      return;
    }

    const serverProgress = Math.min(100, Math.max(0, pumpJob.progress));
    const elapsedMs = (serverProgress / 100) * durationMs;
    anchorRef.current = {
      startedAt: performance.now() - elapsedMs,
      durationMs,
    };

    const tick = (now: number) => {
      const anchor = anchorRef.current;
      if (!anchor) return;

      const next = Math.min(
        100,
        ((now - anchor.startedAt) / anchor.durationMs) * 100,
      );
      setAnimatedProgress(next);

      if (next < 100) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(rafRef.current); };
  }, [
    pumpJob,
    pumpJob?.state,
    pumpJob?.progress,
    pumpJob?.pumpId,
    pumpJob?.purpose,
    pumpJob?.durationSeconds,
    pumpJob?.targetMl,
    pumpJob?.continuous,
    isTimedRunning,
    durationMs,
    mlPerSecond,
  ]);

  if (!pumpJob) return 0;
  if (pumpJob.state === 'complete') return 100;
  if (!isTimedRunning) {
    return roundProgressPercent(pumpJob.progress);
  }

  return animatedProgress;
}
