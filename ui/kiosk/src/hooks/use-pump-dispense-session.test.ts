import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DeviceStatus, PumpJob } from '@/api/types';
import { usePumpDispenseSession } from '@/hooks/use-pump-dispense-session';
import {
  createPumpPourTracker,
  markPumpPourDispenseStarted,
} from '@/lib/pump-pour-lifecycle';
import { createWrapper } from '@/test/render';

const startMutateAsync = vi.fn();
const cancelMutateAsync = vi.fn();
const { fetchDeviceStatus } = vi.hoisted(() => ({
  fetchDeviceStatus: vi.fn(),
}));

let deviceStatus: DeviceStatus | undefined;

vi.mock('@/hooks/use-device-status', () => ({
  useDeviceStatus: () => ({ status: deviceStatus }),
  fetchDeviceStatus,
}));

vi.mock('@/hooks/use-device-mutations', () => ({
  useStartPumpDispense: () => ({ mutateAsync: startMutateAsync }),
  useCancelPumpDispense: () => ({ mutateAsync: cancelMutateAsync }),
}));

const runningJob: PumpJob = {
  pumpId: 2,
  purpose: 'calibration',
  state: 'running',
  progress: 40,
  stepLabel: 'Running',
  durationSeconds: 20,
};

describe('usePumpDispenseSession', () => {
  const wrapper = createWrapper();

  beforeEach(() => {
    startMutateAsync.mockReset();
    cancelMutateAsync.mockReset();
    fetchDeviceStatus.mockReset();
    startMutateAsync.mockResolvedValue(undefined);
    cancelMutateAsync.mockResolvedValue(undefined);
    fetchDeviceStatus.mockResolvedValue({ connected: true, bindings: {} });
    deviceStatus = { connected: true, bindings: {}, pumpJob: null };
  });

  it('starts a dispense run and marks the tracker on success', async () => {
    const trackerRef = { current: createPumpPourTracker() };
    const { result } = renderHook(() => usePumpDispenseSession(), { wrapper });

    await act(async () => {
      await result.current.startRun({
        pumpId: 2,
        purpose: 'calibration',
        durationSeconds: 20,
        tracker: trackerRef,
      });
    });

    expect(startMutateAsync).toHaveBeenCalledWith({
      pumpId: 2,
      purpose: 'calibration',
      durationSeconds: 20,
    });
    expect(trackerRef.current.pending).toBe(true);
    expect(trackerRef.current.seenRunning).toBe(false);
    expect(fetchDeviceStatus).toHaveBeenCalledOnce();
    expect(result.current.error).toBeNull();
  });

  it('resets the tracker and surfaces errors when start fails', async () => {
    startMutateAsync.mockRejectedValue(new Error('Device offline'));
    const trackerRef = { current: createPumpPourTracker() };
    markPumpPourDispenseStarted(trackerRef.current);
    const { result } = renderHook(() => usePumpDispenseSession(), { wrapper });

    await act(async () => {
      await result.current.startRun({
        pumpId: 2,
        purpose: 'prime',
        tracker: trackerRef,
      });
    });

    expect(trackerRef.current).toEqual(createPumpPourTracker());
    expect(result.current.error).toBe('Device offline');
  });

  it('calls cancel and optionally resets the tracker on stop', async () => {
    const trackerRef = { current: createPumpPourTracker() };
    markPumpPourDispenseStarted(trackerRef.current);
    const { result } = renderHook(() => usePumpDispenseSession(), { wrapper });

    await act(async () => {
      await result.current.stopRun({ tracker: trackerRef });
    });

    expect(cancelMutateAsync).toHaveBeenCalledOnce();
    expect(trackerRef.current).toEqual(createPumpPourTracker());
  });

  it('notifies emergency stop when the matching pump is running', async () => {
    deviceStatus = {
      connected: true,
      bindings: {},
      pumpJob: runningJob,
    };
    const onCancelRequested = vi.fn();
    const { result } = renderHook(() => usePumpDispenseSession(), { wrapper });

    await act(async () => {
      await result.current.emergencyStop(2, onCancelRequested);
    });

    expect(onCancelRequested).toHaveBeenCalledOnce();
    expect(cancelMutateAsync).toHaveBeenCalledOnce();
  });

  it('cancels an active run when closing a wizard for that pump', () => {
    deviceStatus = {
      connected: true,
      bindings: {},
      pumpJob: runningJob,
    };
    const onOpenChange = vi.fn();
    const resetLocalState = vi.fn();
    const { result } = renderHook(() => usePumpDispenseSession(), { wrapper });

    act(() => {
      result.current.closeWizard(onOpenChange, resetLocalState, { pumpId: 2 });
    });

    expect(cancelMutateAsync).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(resetLocalState).toHaveBeenCalledOnce();
  });
});
