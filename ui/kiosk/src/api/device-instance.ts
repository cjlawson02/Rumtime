import type { DeviceClient } from '@/api/device-client';
import { HttpDeviceClient } from '@/api/http-device';

/** Shared HTTP device client — MSW intercepts in dev when base URL is rumtime.local. */
export const deviceClient: DeviceClient = new HttpDeviceClient();
