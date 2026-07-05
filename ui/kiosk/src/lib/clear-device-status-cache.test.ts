import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

import { deviceStatusQueryKeyPrefix } from '@/lib/device-query-keys';
import { clearDeviceStatusCache } from '@/lib/clear-device-status-cache';

describe('clearDeviceStatusCache', () => {
  it('cancels and removes all device status queries', () => {
    const queryClient = new QueryClient();
    const cancelSpy = vi.spyOn(queryClient, 'cancelQueries');
    const removeSpy = vi.spyOn(queryClient, 'removeQueries');

    clearDeviceStatusCache(queryClient);

    expect(cancelSpy).toHaveBeenCalledWith({
      queryKey: deviceStatusQueryKeyPrefix,
    });
    expect(removeSpy).toHaveBeenCalledWith({
      queryKey: deviceStatusQueryKeyPrefix,
    });
  });
});
