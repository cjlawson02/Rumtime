import { describe, expect, it } from 'vitest';

import {
  canAppendIpv4Digit,
  canAppendIpv4Dot,
  ipv4DraftFromHostname,
  isValidIpv4,
} from '@/lib/ip-address';

describe('isValidIpv4', () => {
  it('accepts valid addresses', () => {
    expect(isValidIpv4('192.168.1.42')).toBe(true);
    expect(isValidIpv4('10.0.0.1')).toBe(true);
  });

  it('rejects invalid octets and shapes', () => {
    expect(isValidIpv4('256.1.1.1')).toBe(false);
    expect(isValidIpv4('192.168.1')).toBe(false);
    expect(isValidIpv4('rumtime.local')).toBe(false);
    expect(isValidIpv4('01.2.3.4')).toBe(false);
    expect(isValidIpv4('192.168.01.1')).toBe(false);
  });
});

describe('ipv4DraftFromHostname', () => {
  it('returns the hostname only when it is IPv4', () => {
    expect(ipv4DraftFromHostname('192.168.0.10')).toBe('192.168.0.10');
    expect(ipv4DraftFromHostname('rumtime.local')).toBe('');
  });
});

describe('ipv4 pad constraints', () => {
  it('blocks octets above 255', () => {
    expect(canAppendIpv4Digit('25', '6')).toBe(false);
    expect(canAppendIpv4Digit('192.', '2')).toBe(true);
  });

  it('allows dots only between completed octets', () => {
    expect(canAppendIpv4Dot('192')).toBe(true);
    expect(canAppendIpv4Dot('192.')).toBe(false);
    expect(canAppendIpv4Dot('192.168.1.42')).toBe(false);
  });

  it('requires a dot after a lone zero octet', () => {
    expect(canAppendIpv4Digit('192.0', '1')).toBe(false);
    expect(canAppendIpv4Dot('192.0')).toBe(true);
  });
});
