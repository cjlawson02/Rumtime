import { useEffect } from 'react';

import { suspendSetupPinLock } from '@/lib/setup-pin-suspend';

export function useSetupPinSuspend(active: boolean, reason = 'setup-wizard'): void {
  useEffect(() => {
    if (!active) return;
    return suspendSetupPinLock(reason);
  }, [active, reason]);
}
