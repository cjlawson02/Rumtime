import { describe, expect, it } from 'vitest';

import { ipAddressPadCanSave } from '@/components/kiosk/ip-address-pad-dialog';

describe('ipAddressPadCanSave', () => {
  it('accepts complete IPv4 addresses', () => {
    expect(ipAddressPadCanSave('192.168.1.10')).toBe(true);
  });

  it('rejects partial or invalid input', () => {
    expect(ipAddressPadCanSave('')).toBe(false);
    expect(ipAddressPadCanSave('192.168')).toBe(false);
    expect(ipAddressPadCanSave('01.2.3.4')).toBe(false);
  });
});
