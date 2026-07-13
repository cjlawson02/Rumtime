import { useEffect, useRef, useState } from 'react';

import type { PourJob } from '@/api/types';

/**
 * Deterministic pour progress from wall-clock elapsed / estimated total duration.
 * Starts once when the job becomes `pouring`; does not re-anchor to server samples.
 */
export function useTimedPourProgress(
  job: PourJob | null | undefined,
  durationMs: number,
): number {
  const [progress, setProgress] = useState(0);
  const startedAtRef = useRef<number | null>(null);
  const rafRef = useRef(0);

  const pouring = job?.state === 'pouring';
  const complete = job?.state === 'complete';

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);

    if (!pouring || durationMs <= 0) {
      startedAtRef.current = null;
      return;
    }

    if (startedAtRef.current === null) {
      startedAtRef.current = performance.now();
    }

    const tick = (now: number) => {
      const startedAt = startedAtRef.current;
      if (startedAt === null) return;
      const next = Math.min(100, ((now - startedAt) / durationMs) * 100);
      setProgress(next);
      if (next < 100) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [pouring, durationMs, job?.recipeId]);

  if (complete) return 100;
  if (!pouring) return 0;
  return progress;
}
