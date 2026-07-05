/** Kiosk runtime config — env-backed, not hardcoded in components. */
export const kioskConfig = {
  setupPin: import.meta.env.VITE_SETUP_PIN ?? '',
  devicePollMs: Number(import.meta.env.VITE_DEVICE_POLL_MS ?? 500),
} as const;

export function isSetupPinConfigured(): boolean {
  return kioskConfig.setupPin.length > 0;
}

export function verifySetupPin(input: string): boolean {
  // Operator UX gate only — not a security boundary (trusted LAN, no device auth in v1).
  const expected = kioskConfig.setupPin;
  if (!expected) {
    if (import.meta.env.DEV) {
      console.warn('VITE_SETUP_PIN is unset — setup gate disabled in dev only');
      return true;
    }
    return false;
  }
  return input === expected;
}
