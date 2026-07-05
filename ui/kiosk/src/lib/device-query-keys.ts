import { getDeviceApiBase } from '@/lib/device-endpoint';

export const deviceStatusQueryKeyPrefix = ['device', 'status'] as const;

export function deviceStatusQueryKey(
  deviceApiBase = getDeviceApiBase(),
): readonly ['device', 'status', string] {
  return [...deviceStatusQueryKeyPrefix, deviceApiBase] as const;
}
