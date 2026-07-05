import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getStatus } = vi.hoisted(() => ({
  getStatus: vi.fn(),
}));

vi.mock('@/api', () => ({
  deviceClient: {
    getStatus,
  },
}));

vi.mock('@/hooks/use-device-endpoint', () => ({
  useDeviceEndpoint: () => ({
    deviceApiBase: 'http://rumtime.local',
  }),
}));

import {
  deriveDeviceConnected,
  deriveDeviceStatusLoading,
  deviceStatusQueryFn,
  fetchDeviceStatus,
  statusPlaceholderData,
  statusRefetchIntervalMs,
  useDeviceStatus,
} from '@/hooks/use-device-status';
import { deviceStatusQueryKey } from '@/lib/device-query-keys';
import type { DeviceStatus } from '@/api/types';
import { createWrapper } from '@/test/render';

const sampleStatus = {
  connected: true,
  bindings: {},
} satisfies DeviceStatus;

describe('statusPlaceholderData', () => {
  it('keeps previous data during background refetch for the same endpoint', () => {
    expect(
      statusPlaceholderData(sampleStatus, {
        queryKey: ['device', 'status', 'http://rumtime.local'],
      }, 'http://rumtime.local'),
    ).toBe(sampleStatus);
  });

  it('drops previous data when the endpoint changes', () => {
    expect(
      statusPlaceholderData(sampleStatus, {
        queryKey: ['device', 'status', 'http://rumtime.local'],
      }, 'http://192.168.1.42'),
    ).toBeUndefined();
  });
});

describe('deriveDeviceStatusLoading', () => {
  it('is true only before the first fetch completes', () => {
    expect(deriveDeviceStatusLoading(false, true)).toBe(true);
    expect(deriveDeviceStatusLoading(true, true)).toBe(false);
    expect(deriveDeviceStatusLoading(true, false)).toBe(false);
  });
});

describe('deriveDeviceConnected', () => {
  it('requires successful data with connected true', () => {
    expect(deriveDeviceConnected(sampleStatus, false)).toBe(true);
    expect(deriveDeviceConnected(sampleStatus, true)).toBe(false);
    expect(deriveDeviceConnected(undefined, false)).toBe(false);
  });
});

describe('statusRefetchIntervalMs', () => {
  it('pauses while fetching and slows down after errors', () => {
    expect(statusRefetchIntervalMs('fetching', 'success', 500)).toBe(false);
    expect(statusRefetchIntervalMs('idle', 'error', 500)).toBe(3000);
    expect(statusRefetchIntervalMs('idle', 'success', 500)).toBe(500);
  });
});

describe('deviceStatusQueryFn', () => {
  it('forwards abort signals to deviceClient.getStatus', async () => {
    getStatus.mockResolvedValue(sampleStatus);
    const controller = new AbortController();

    await deviceStatusQueryFn({ signal: controller.signal });

    expect(getStatus).toHaveBeenCalledWith({ signal: controller.signal });
  });
});

describe('fetchDeviceStatus', () => {
  beforeEach(() => {
    getStatus.mockReset();
    getStatus.mockResolvedValue({
      connected: true,
      bindings: {},
      pumps: [],
    });
  });

  it('reads status through the shared query key', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const status = await fetchDeviceStatus(queryClient);

    expect(getStatus).toHaveBeenCalledOnce();
    expect(status.connected).toBe(true);
    expect(queryClient.getQueryData(deviceStatusQueryKey())).toEqual(status);
  });
});

describe('useDeviceStatus', () => {
  beforeEach(() => {
    getStatus.mockReset();
    getStatus.mockResolvedValue({
      connected: true,
      bindings: { bourbon: { ingredientId: 'bourbon', remainingMl: 100 } },
      pumps: [],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns loading, then connected status data', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(() => useDeviceStatus(), {
      wrapper: createWrapper({ queryClient }),
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.status).toBeNull();

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.connected).toBe(true);
    expect(result.current.status?.bindings.bourbon.remainingMl).toBe(100);
    expect(result.current.error).toBeNull();
  });

  it('surfaces fetch errors and marks the device disconnected', async () => {
    getStatus.mockRejectedValue(new Error('Device offline'));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(() => useDeviceStatus(), {
      wrapper: createWrapper({ queryClient }),
    });

    await waitFor(() => {
      expect(result.current.error).toBe('Device offline');
    });

    expect(result.current.connected).toBe(false);
    expect(result.current.status).toBeNull();
  });

  it('keeps stale status but forces connected false after errors', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(deviceStatusQueryKey('http://rumtime.local'), {
      connected: true,
      bindings: {},
    });

    getStatus.mockRejectedValue(new Error('Device offline'));
    const { result } = renderHook(() => useDeviceStatus(), {
      wrapper: createWrapper({ queryClient }),
    });

    await waitFor(() => {
      expect(result.current.error).toBe('Device offline');
    });

    expect(result.current.status).toMatchObject({ connected: false });
    expect(result.current.connected).toBe(false);
  });

  it('refetches status when refresh is called', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(() => useDeviceStatus(), {
      wrapper: createWrapper({ queryClient }),
    });

    await waitFor(() => {
      expect(result.current.connected).toBe(true);
    });

    getStatus.mockClear();
    getStatus.mockResolvedValue({
      connected: true,
      bindings: { bourbon: { ingredientId: 'bourbon', remainingMl: 50 } },
    });

    await act(async () => {
      await result.current.refresh({ force: true });
    });

    expect(getStatus).toHaveBeenCalled();
    await waitFor(() => {
      expect(result.current.status?.bindings.bourbon.remainingMl).toBe(50);
    });
  });

  it('uses a fallback error message for non-Error failures', async () => {
    getStatus.mockRejectedValue('offline');
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(() => useDeviceStatus(), {
      wrapper: createWrapper({ queryClient }),
    });

    await waitFor(() => {
      expect(result.current.error).toBe('Device unreachable');
    });
  });
});
