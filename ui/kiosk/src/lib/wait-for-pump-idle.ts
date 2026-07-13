import type { QueryClient } from '@tanstack/react-query';

import type { DeviceStatus } from '@/api/types';
import { fetchDeviceStatus } from '@/hooks/use-device-status';

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_POLL_MS = 250;

function isPumpJobIdle(status: DeviceStatus, pumpId?: number): boolean {
  const job = status.pumpJob;
  if (!job || job.state !== 'running') return true;
  if (pumpId !== undefined && job.pumpId !== pumpId) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Poll /status until the pump job is cleared or no longer running. */
export async function waitForPumpJobIdle(
  queryClient: QueryClient,
  options?: { pumpId?: number; timeoutMs?: number; pollMs?: number },
): Promise<DeviceStatus> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollMs = options?.pollMs ?? DEFAULT_POLL_MS;
  const pumpId = options?.pumpId;
  const deadline = Date.now() + timeoutMs;

  let latest = await fetchDeviceStatus(queryClient);
  while (!isPumpJobIdle(latest, pumpId)) {
    if (Date.now() >= deadline) {
      throw new Error('Timed out waiting for pump to stop');
    }
    await sleep(pollMs);
    latest = await fetchDeviceStatus(queryClient);
  }

  return latest;
}
