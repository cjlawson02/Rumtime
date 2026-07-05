import { QueryClient } from '@tanstack/react-query';

import { deviceStatusQueryKeyPrefix } from '@/lib/device-query-keys';

export function clearDeviceStatusCache(queryClient: QueryClient): void {
  void queryClient.cancelQueries({ queryKey: deviceStatusQueryKeyPrefix });
  queryClient.removeQueries({ queryKey: deviceStatusQueryKeyPrefix });
}
