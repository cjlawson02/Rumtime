import { useCallback, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { clearDeviceStatusCache } from '@/lib/clear-device-status-cache';
import {
  clearDeviceApiBaseOverride,
  DEFAULT_DEVICE_API_BASE,
  formatHostnameInput,
  getDeviceApiBase,
  readDeviceApiBaseOverride,
  setDeviceApiBaseOverride,
  subscribeDeviceEndpoint,
} from '@/lib/device-endpoint';

export function useDeviceEndpoint() {
  const queryClient = useQueryClient();
  const deviceApiBase = useSyncExternalStore(
    subscribeDeviceEndpoint,
    getDeviceApiBase,
    () => DEFAULT_DEVICE_API_BASE,
  );

  const override = useSyncExternalStore(
    subscribeDeviceEndpoint,
    readDeviceApiBaseOverride,
    () => null,
  );

  const isOverridden = override !== null;
  const hostname = formatHostnameInput(deviceApiBase);

  const clearStatusCache = useCallback(() => {
    clearDeviceStatusCache(queryClient);
  }, [queryClient]);

  const setHostname = useCallback(
    (input: string) => {
      setDeviceApiBaseOverride(input);
      clearStatusCache();
    },
    [clearStatusCache],
  );

  const resetHostname = useCallback(() => {
    clearDeviceApiBaseOverride();
    clearStatusCache();
  }, [clearStatusCache]);

  return {
    deviceApiBase,
    defaultDeviceApiBase: DEFAULT_DEVICE_API_BASE,
    hostname,
    isOverridden,
    setHostname,
    resetHostname,
  };
}
