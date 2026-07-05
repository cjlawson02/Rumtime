import { useCallback, useMemo } from 'react';
import { useQuery, type QueryClient } from '@tanstack/react-query';

import { deviceClient } from '@/api';
import type { DeviceStatus } from '@/api/types';
import { useDeviceEndpoint } from '@/hooks/use-device-endpoint';
import { kioskConfig } from '@/lib/config';
import { deviceStatusQueryKey } from '@/lib/device-query-keys';

export { deviceStatusQueryKey, deviceStatusQueryKeyPrefix } from '@/lib/device-query-keys';

export function deviceStatusQueryFn({ signal }: { signal?: AbortSignal }) {
  return deviceClient.getStatus({ signal });
}

export function fetchDeviceStatus(queryClient: QueryClient) {
  return queryClient.fetchQuery({
    queryKey: deviceStatusQueryKey(),
    queryFn: deviceStatusQueryFn,
  });
}

function pollIntervalMs(): number {
  const raw = kioskConfig.devicePollMs;
  return Number.isFinite(raw) && raw > 0 ? raw : 500;
}

export function statusPlaceholderData(
  previousData: DeviceStatus | undefined,
  previousQuery: { queryKey: readonly unknown[] } | undefined,
  deviceApiBase: string,
): DeviceStatus | undefined {
  if (previousQuery?.queryKey[2] === deviceApiBase) {
    return previousData;
  }
  return undefined;
}

export function deriveDeviceStatusLoading(
  isFetched: boolean,
  isFetching: boolean,
): boolean {
  return !isFetched && isFetching;
}

export function deriveDeviceConnected(
  data: DeviceStatus | undefined,
  isError: boolean,
): boolean {
  return !isError && Boolean(data?.connected);
}

export function statusRefetchIntervalMs(
  fetchStatus: string,
  status: string,
  pollMs: number,
  errorPollMs = 3000,
): number | false {
  if (fetchStatus === 'fetching') return false;
  if (status === 'error') return errorPollMs;
  return pollMs;
}

type RefreshOptions = {
  force?: boolean;
};

type UseDeviceStatusResult = {
  status: DeviceStatus | null;
  error: string | null;
  loading: boolean;
  connected: boolean;
  refresh: (options?: RefreshOptions) => Promise<void>;
};

export function useDeviceStatus(): UseDeviceStatusResult {
  const { deviceApiBase } = useDeviceEndpoint();

  const query = useQuery({
    queryKey: deviceStatusQueryKey(deviceApiBase),
    queryFn: deviceStatusQueryFn,
    refetchInterval: (query) =>
      statusRefetchIntervalMs(
        query.state.fetchStatus,
        query.state.status,
        pollIntervalMs(),
      ),
    placeholderData: (previousData, previousQuery) =>
      statusPlaceholderData(previousData, previousQuery, deviceApiBase),
    retry: false,
  });

  const status = useMemo((): DeviceStatus | null => {
    if (!query.data) return null;
    if (query.isError) {
      return { ...query.data, connected: false };
    }
    return query.data;
  }, [query.data, query.isError]);

  const error = query.isError
    ? query.error instanceof Error
      ? query.error.message
      : 'Device unreachable'
    : null;

  const connected = deriveDeviceConnected(query.data, query.isError);

  const refresh = useCallback(
    async (options?: RefreshOptions) => {
      await query.refetch({ cancelRefetch: options?.force ?? false });
    },
    [query],
  );

  const loading = deriveDeviceStatusLoading(query.isFetched, query.isFetching);

  return {
    status,
    error,
    loading,
    connected,
    refresh,
  };
}
