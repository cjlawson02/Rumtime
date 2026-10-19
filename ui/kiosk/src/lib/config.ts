/** Kiosk runtime config — env-backed, not hardcoded in components. */
export const kioskConfig = {
  setupPin: import.meta.env.VITE_SETUP_PIN ?? "",
  devicePollMs: Number(import.meta.env.VITE_DEVICE_POLL_MS ?? 500),
} as const;

export function isSetupPinConfigured(): boolean {
  return kioskConfig.setupPin.length > 0;
}

/** Pure pin check — kept separate so browser tests can cover branches without stubbing Vite env literals. */
export function verifySetupPinValue(input: string, expected: string, isDev: boolean): boolean {
  if (!expected) {
    if (isDev) {
      console.warn("VITE_SETUP_PIN is unset — setup gate disabled in dev only");
      return true;
    }
    return false;
  }
  return input === expected;
}

export function verifySetupPin(input: string): boolean {
  // Operator UX gate only — not a security boundary (trusted LAN, no device auth in v1).
  return verifySetupPinValue(input, kioskConfig.setupPin, import.meta.env.DEV);
}
