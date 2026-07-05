const suspendCounts = new Map<string, number>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function isSetupPinLockSuspended(): boolean {
  for (const count of suspendCounts.values()) {
    if (count > 0) return true;
  }
  return false;
}

export function subscribeSetupPinLockSuspension(
  listener: () => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Hold the setup PIN gate open until the returned cleanup runs. */
export function suspendSetupPinLock(reason: string): () => void {
  suspendCounts.set(reason, (suspendCounts.get(reason) ?? 0) + 1);
  notify();

  let released = false;
  return () => {
    if (released) return;
    released = true;

    const next = (suspendCounts.get(reason) ?? 1) - 1;
    if (next <= 0) {
      suspendCounts.delete(reason);
    } else {
      suspendCounts.set(reason, next);
    }
    notify();
  };
}

/** Test-only reset — not for production use. */
export function resetSetupPinLockSuspensionForTests(): void {
  suspendCounts.clear();
  notify();
}
