import { describe, expect, it } from 'vitest';

import {
  formatDisconnectReason,
  formatFreeHeap,
  formatUptime,
  formatWifiRssi,
} from '@/lib/device-link';

describe('device-link formatters', () => {
  it('formats rssi, uptime, heap, and disconnect reason', () => {
    expect(formatWifiRssi(-62)).toBe('-62 dBm');
    expect(formatWifiRssi(0)).toBe('—');
    expect(formatUptime(3661)).toBe('1h 1m');
    expect(formatUptime(95)).toBe('1m 35s');
    expect(formatFreeHeap(204800)).toBe('200 KB');
    expect(formatDisconnectReason(8)).toBe('8 (assoc leave)');
    expect(formatDisconnectReason(0)).toBe('None');
    expect(formatDisconnectReason(99)).toBe('99');
  });
});
