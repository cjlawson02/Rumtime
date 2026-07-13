import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

import { IpAddressPad } from '@/components/kiosk/ip-address-pad';
import { PadDialogFooter } from '@/components/kiosk/pad-dialog-shell';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useDeviceEndpoint } from '@/hooks/use-device-endpoint';
import { useDeviceStatus } from '@/hooks/use-device-status';
import { formatHostnameInput } from '@/lib/device-endpoint';
import { ipv4DraftFromHostname, isValidIpv4 } from '@/lib/ip-address';
import { KIOSK_DIALOG_CONTENT_CLASSNAME } from '@/lib/kiosk-input-styles';

/**
 * Non-dismissible overlay while the pour controller is unreachable.
 * Offers retry and an inline IP override so operators can recover without setup.
 */
export function ConnectionHelper() {
  const { error, loading, connected, refresh } = useDeviceStatus();
  const {
    hostname,
    isOverridden,
    setHostname,
    resetHostname,
    defaultDeviceApiBase,
  } = useDeviceEndpoint();

  const [ipMode, setIpMode] = useState(false);
  const [draft, setDraft] = useState('');
  const [retrying, setRetrying] = useState(false);

  const open = !loading && !connected;

  useEffect(() => {
    if (open) return;
    queueMicrotask(() => {
      setIpMode(false);
      setRetrying(false);
    });
  }, [open]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) return;
  };

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await refresh({ force: true });
    } finally {
      setRetrying(false);
    }
  };

  const openIpPad = () => {
    setDraft(ipv4DraftFromHostname(hostname));
    setIpMode(true);
  };

  const cancelIpPad = () => {
    setDraft(ipv4DraftFromHostname(hostname));
    setIpMode(false);
  };

  const saveIp = () => {
    if (!isValidIpv4(draft)) return;
    setHostname(draft);
    setIpMode(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={KIOSK_DIALOG_CONTENT_CLASSNAME}
      >
        {ipMode ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-center font-heading text-2xl">
                IP address
              </DialogTitle>
              <DialogDescription className="text-center">
                Enter the dispenser address on your home network.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 rounded-xl border border-border/60 px-4 py-6">
              <IpAddressPad
                value={draft}
                onChange={setDraft}
                disabled={retrying}
              />
              {draft.length > 0 && !isValidIpv4(draft) ? (
                <p className="text-center text-sm text-destructive">
                  Enter a valid IP address
                </p>
              ) : null}
            </div>

            <PadDialogFooter
              onCancel={cancelIpPad}
              onSave={saveIp}
              saveDisabled={!isValidIpv4(draft)}
            />
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="mx-auto mb-2 flex size-14 items-center justify-center rounded-full bg-amber-500/15 ring-1 ring-amber-500/30">
                <WifiOff className="size-7 text-amber-200" />
              </div>
              <DialogTitle className="text-center font-heading text-2xl">
                Device offline
              </DialogTitle>
              <DialogDescription className="text-center">
                Can&apos;t reach the pour controller at{' '}
                <span className="font-medium text-foreground">{hostname}</span>.
                Check power and Wi‑Fi, then retry — or set an IP if discovery
                fails.
              </DialogDescription>
            </DialogHeader>

            {error ? (
              <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-center text-sm text-destructive">
                {error}
              </p>
            ) : null}

            {isOverridden ? (
              <p className="text-center text-sm text-muted-foreground">
                Overriding build default (
                {formatHostnameInput(defaultDeviceApiBase)}).{' '}
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={resetHostname}
                >
                  Reset to default
                </button>
              </p>
            ) : null}

            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <Button
                type="button"
                className="kiosk-touch w-full"
                disabled={retrying}
                onClick={() => void handleRetry()}
              >
                {retrying ? 'Retrying…' : 'Retry'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="kiosk-touch w-full"
                disabled={retrying}
                onClick={openIpPad}
              >
                Change IP address
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
