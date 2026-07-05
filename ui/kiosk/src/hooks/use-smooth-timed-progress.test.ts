import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PumpJob } from '@/api/types';
import { useSmoothTimedProgress } from '@/hooks/use-smooth-timed-progress';

const baseJob: PumpJob = {
  pumpId: 1,
  purpose: 'calibration',
  state: 'running',
  progress: 0,
  stepLabel: 'Calibration run…',
};

describe('useSmoothTimedProgress', () => {
  beforeEach(() => {
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('requestAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns zero when there is no pump job', () => {
    const { result } = renderHook(() => useSmoothTimedProgress(null));
    expect(result.current).toBe(0);
  });

  it('returns one hundred for a complete job', () => {
    const { result } = renderHook(() =>
      useSmoothTimedProgress({ ...baseJob, state: 'complete', progress: 100 }),
    );
    expect(result.current).toBe(100);
  });

  it('returns rounded server progress for continuous runs', () => {
    const { result } = renderHook(() =>
      useSmoothTimedProgress({
        ...baseJob,
        continuous: true,
        progress: 33.6,
      }),
    );
    expect(result.current).toBe(34);
  });

  it('animates timed runs from the server progress anchor', () => {
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValue(10_000);

    let frame: FrameRequestCallback | null = null;
    vi.stubGlobal(
      'requestAnimationFrame',
      (callback: FrameRequestCallback) => {
        frame = callback;
        return 1;
      },
    );

    const { result } = renderHook(() =>
      useSmoothTimedProgress({
        ...baseJob,
        durationSeconds: 10,
        progress: 50,
      }),
    );

    expect(result.current).toBe(0);

    act(() => {
      frame?.(15_000);
    });

    expect(result.current).toBe(100);
    now.mockRestore();
  });
});
