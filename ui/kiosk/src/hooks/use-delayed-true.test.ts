import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDelayedTrue } from '@/hooks/use-delayed-true';

describe('useDelayedTrue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stays false until the delay elapses while active', () => {
    const { result } = renderHook(() => useDelayedTrue(true, 500));

    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(true);
  });

  it('resets when active becomes false before the delay', () => {
    const { result, rerender } = renderHook(
      ({ active }) => useDelayedTrue(active, 500),
      { initialProps: { active: true } },
    );

    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender({ active: false });
    expect(result.current).toBe(false);

    rerender({ active: true });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current).toBe(true);
  });
});
