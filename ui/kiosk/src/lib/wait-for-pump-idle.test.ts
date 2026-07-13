import { QueryClient } from '@tanstack/react-query';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import type { DeviceStatus } from '@/api/types';
import { fetchDeviceStatus } from '@/hooks/use-device-status';
import { waitForPumpJobIdle } from '@/lib/wait-for-pump-idle';

vi.mock('@/hooks/use-device-status', () => ({
  fetchDeviceStatus: vi.fn(),
}));

const fetchDeviceStatusMock = vi.mocked(fetchDeviceStatus);

function statusWithPumpJob(
  pumpId: number,
  state: 'running' | 'complete' | 'cancelled' = 'running',
): DeviceStatus {
  return {
    connected: true,
    bindings: {},
    pumpJob: {
      pumpId,
      purpose: 'prime',
      state,
      continuous: true,
      stepLabel: 'Priming',
    },
  } as DeviceStatus;
}

describe('waitForPumpJobIdle', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
    fetchDeviceStatusMock.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns immediately when the pump is already idle', async () => {
    const idle = { connected: true, bindings: {}, pumpJob: null } as DeviceStatus;
    fetchDeviceStatusMock.mockResolvedValue(idle);

    await expect(
      waitForPumpJobIdle(queryClient, { pumpId: 1 }),
    ).resolves.toBe(idle);
    expect(fetchDeviceStatusMock).toHaveBeenCalledOnce();
  });

  it('polls until the target pump stops running', async () => {
    fetchDeviceStatusMock
      .mockResolvedValueOnce(statusWithPumpJob(1))
      .mockResolvedValueOnce(statusWithPumpJob(1))
      .mockResolvedValueOnce({ connected: true, bindings: {}, pumpJob: null });


    const promise = waitForPumpJobIdle(queryClient, {
      pumpId: 1,
      pollMs: 100,
    });

    await vi.advanceTimersByTimeAsync(200);
    await expect(promise).resolves.toMatchObject({ pumpJob: null });
    expect(fetchDeviceStatusMock).toHaveBeenCalledTimes(3);
  });

  it('times out if the pump keeps running', async () => {
    fetchDeviceStatusMock.mockResolvedValue(statusWithPumpJob(1));

    const promise = waitForPumpJobIdle(queryClient, {
      pumpId: 1,
      timeoutMs: 500,
      pollMs: 100,
    });
    const assertion = expect(promise).rejects.toThrow(
      'Timed out waiting for pump to stop',
    );

    await vi.advanceTimersByTimeAsync(600);
    await assertion;
  });
});
