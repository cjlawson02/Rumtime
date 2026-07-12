import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useLocation } from 'wouter';

import { LinkButton } from '@/components/kiosk/link-button';
import { KioskShell } from '@/components/kiosk/kiosk-shell';
import { SetupPinDialog } from '@/components/kiosk/setup-pin-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useDeviceStatus } from '@/hooks/use-device-status';
import { useSetupReturn } from '@/hooks/use-setup-return';
import { isSetupPinConfigured } from '@/lib/config';
import { KIOSK_DIALOG_CONTENT_CLASSNAME } from '@/lib/kiosk-input-styles';
import { hasSetupUnlock } from '@/lib/setup-unlock';
import {
  isSetupPinLockSuspended,
  subscribeSetupPinLockSuspension,
} from '@/lib/setup-pin-suspend';

const UNLOCK_RECHECK_MS = 30_000;

type SetupGateProps = {
  children: ReactNode;
  pinTitle?: string;
  pinDescription?: string;
};

function useDeferSetupPinLock(): boolean {
  const pinSuspended = useSyncExternalStore(
    subscribeSetupPinLockSuspension,
    isSetupPinLockSuspended,
    () => false,
  );
  const { status } = useDeviceStatus();
  const pumpRunning = status?.pumpJob?.state === 'running';

  return pinSuspended || pumpRunning;
}

export function SetupGate({
  children,
  pinTitle = 'Setup PIN',
  pinDescription = 'Enter the 4-digit PIN to access machine setup.',
}: SetupGateProps) {
  const returnTo = useSetupReturn();
  const [, navigate] = useLocation();
  const deferPinLock = useDeferSetupPinLock();
  const [requiresPin, setRequiresPin] = useState(() => !hasSetupUnlock());
  const [dialogOpen, setDialogOpen] = useState(() => !hasSetupUnlock());

  useEffect(() => {
    if (requiresPin) return;

    const id = window.setInterval(() => {
      if (hasSetupUnlock()) return;

      if (deferPinLock) return;

      setRequiresPin(true);
      setDialogOpen(true);
    }, UNLOCK_RECHECK_MS);

    return () => {
      window.clearInterval(id);
    };
  }, [requiresPin, deferPinLock]);

  useEffect(() => {
    if (requiresPin || deferPinLock || hasSetupUnlock()) return;

    queueMicrotask(() => {
      if (hasSetupUnlock()) return;
      setRequiresPin(true);
      setDialogOpen(true);
    });
  }, [deferPinLock, requiresPin]);

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) {
      navigate(returnTo);
      return;
    }
    setDialogOpen(open);
  };

  const handlePinSuccess = () => {
    setRequiresPin(false);
    setDialogOpen(false);
  };

  if (!requiresPin) {
    return children;
  }

  if (!isSetupPinConfigured() && import.meta.env.PROD) {
    return (
      <KioskShell>
        <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
          <DialogContent
            showCloseButton={false}
            className={KIOSK_DIALOG_CONTENT_CLASSNAME}
          >
            <DialogHeader>
              <DialogTitle className="font-heading text-2xl">
                Setup unavailable
              </DialogTitle>
              <DialogDescription>
                Setup PIN was not configured at build time. Set{' '}
                <code className="text-xs">VITE_SETUP_PIN</code> when building
                the production bundle and redeploy.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <LinkButton
                href={returnTo}
                variant="outline"
                className="kiosk-touch"
              >
                Back
              </LinkButton>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </KioskShell>
    );
  }

  return (
    <KioskShell>
      <SetupPinDialog
        open={dialogOpen}
        onOpenChange={handleDialogOpenChange}
        title={pinTitle}
        description={pinDescription}
        onSuccess={handlePinSuccess}
      />
    </KioskShell>
  );
}
