const KEY_PREFIX = 'kiosk-pour-bypass-inventory:';
const MAX_AGE_MS = 5 * 60 * 1000;

function storageKey(recipeId: string): string {
  return `${KEY_PREFIX}${recipeId}`;
}

/** One-time operator consent to pour despite low inventory (not URL-visible). */
export function grantPourInventoryBypass(recipeId: string): void {
  sessionStorage.setItem(storageKey(recipeId), String(Date.now()));
}

export function peekPourInventoryBypass(recipeId: string): boolean {
  const raw = sessionStorage.getItem(storageKey(recipeId));
  if (!raw) return false;

  const ts = Number(raw);
  if (Number.isNaN(ts) || Date.now() - ts > MAX_AGE_MS) {
    sessionStorage.removeItem(storageKey(recipeId));
    return false;
  }

  return true;
}

/** Read and clear bypass so it cannot be reused from the address bar. */
export function consumePourInventoryBypass(recipeId: string): boolean {
  if (!peekPourInventoryBypass(recipeId)) return false;
  sessionStorage.removeItem(storageKey(recipeId));
  return true;
}

export function clearPourInventoryBypass(recipeId: string): void {
  sessionStorage.removeItem(storageKey(recipeId));
}
