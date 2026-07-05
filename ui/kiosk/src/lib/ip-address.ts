const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export const IPV4_MAX_LENGTH = 15;

export function isValidIpv4(input: string): boolean {
  const match = IPV4_PATTERN.exec(input.trim());
  if (!match) return false;

  return match.slice(1).every((octet) => {
    if (octet.length > 1 && octet.startsWith('0')) return false;
    const value = Number(octet);
    return value >= 0 && value <= 255;
  });
}

/** Prefill the pad when the current hostname is already an IPv4 address. */
export function ipv4DraftFromHostname(hostname: string): string {
  return isValidIpv4(hostname) ? hostname : '';
}

export function canAppendIpv4Digit(value: string, digit: string): boolean {
  if (value.length >= IPV4_MAX_LENGTH) return false;

  const octets = value.split('.');
  const currentOctet = octets[octets.length - 1] ?? '';
  if (value.endsWith('.')) {
    return true;
  }
  if (currentOctet === '0') return false;
  if (currentOctet.length >= 3) return false;

  const nextOctet = `${currentOctet}${digit}`;
  return Number(nextOctet) <= 255;
}

export function canAppendIpv4Dot(value: string): boolean {
  if (!value || value.endsWith('.')) return false;

  const octets = value.split('.');
  if (octets.length >= 4) return false;

  const currentOctet = octets[octets.length - 1] ?? '';
  return currentOctet.length > 0;
}
