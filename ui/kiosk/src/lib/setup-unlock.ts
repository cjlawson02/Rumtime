const SESSION_KEY = 'kiosk-setup-unlocked';
const MAX_AGE_MS = 15 * 60 * 1000;

export function grantSetupUnlock(): void {
  sessionStorage.setItem(SESSION_KEY, String(Date.now()));
}

export function hasSetupUnlock(): boolean {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return false;

  const ts = Number(raw);
  if (Number.isNaN(ts) || Date.now() - ts > MAX_AGE_MS) {
    sessionStorage.removeItem(SESSION_KEY);
    return false;
  }

  return true;
}
