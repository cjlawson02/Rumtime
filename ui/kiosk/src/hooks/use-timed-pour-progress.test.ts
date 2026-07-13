import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PourJob } from '@/api/types';
import { useTimedPourProgress } from '@/hooks/use-timed-pour-progress';

const pouring: PourJob = {
  recipeId: 'old-fashioned',
  state: 'pouring',
  progress: 0,
  stepLabel: 'Pouring…',
};

describe('useTimedPourProgress', () => {
  beforeEach(() => {
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('requestAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns 100 when complete', () => {
    const { result } = renderHook(() =>
      useTimedPourProgress(
        { ...pouring, state: 'complete', progress: 100 },
        10_000,
      ),
    );
    expect(result.current).toBe(100);
  });

  it('advances from a fixed start time without re-anchoring to server progress', () => {
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValue(1_000);

    let frame: FrameRequestCallback | null = null;
    vi.stubGlobal(
      'requestAnimationFrame',
      (callback: FrameRequestCallback) => {
        frame = callback;
        return 1;
      },
    );

    const { result, rerender } = renderHook(
      ({ job }) => useTimedPourProgress(job, 10_000),
      { initialProps: { job: pouring } },
    );

    act(() => {
      frame?.(6_000);
    });
    expect(result.current).toBe(50);

    // Server sample dips — local clock must not jump backward.
    rerender({
      job: { ...pouring, progress: 40 },
    });

    act(() => {
      frame?.(6_000);
    });
    expect(result.current).toBe(50);

    act(() => {
      frame?.(11_000);
    });
    expect(result.current).toBe(100);
    now.mockRestore();
  });
});
