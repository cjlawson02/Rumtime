import { useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';

import { IpAddressPadDialog } from '@/components/kiosk/ip-address-pad-dialog';
import { SetupSectionLayout } from '@/components/kiosk/setup-section-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { DEVICE_SETUP_SECTION } from '@/data/setup-sections';
import { useDeviceEndpoint } from '@/hooks/use-device-endpoint';
import { useDeviceStatus } from '@/hooks/use-device-status';
import { formatHostnameInput } from '@/lib/device-endpoint';
import { ipv4DraftFromHostname } from '@/lib/ip-address';

const machineStatus = DEVICE_SETUP_SECTION;

function StatusRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 py-3 last:border-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium">{value}</dd>
    </div>
  );
}

function HostnameRow({
  hostname,
  isOverridden,
  defaultDeviceApiBase,
  onSave,
  onReset,
}: {
  hostname: string;
  isOverridden: boolean;
  defaultDeviceApiBase: string;
  onSave: (ipAddress: string) => void;
  onReset: () => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const openDialog = () => {
    setDraft(ipv4DraftFromHostname(hostname));
    setDialogOpen(true);
  };

  const dismissDialog = () => {
    setDraft(ipv4DraftFromHostname(hostname));
  };

  return (
    <>
      <div className="flex items-center justify-between gap-4 border-b border-border/60 py-3">
        <dt className="text-sm text-muted-foreground">
          {isOverridden ? 'IP address' : 'Address'}
        </dt>
        <dd className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <span className="text-right text-sm font-medium tabular-nums">
            {hostname}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="kiosk-touch shrink-0 text-muted-foreground"
            onClick={openDialog}
          >
            Change
          </Button>
        </dd>
      </div>
      {isOverridden ? (
        <p className="border-b border-border/60 py-2 text-right text-sm text-muted-foreground">
          Overriding build default ({formatHostnameInput(defaultDeviceApiBase)}).{' '}
          <button
            type="button"
            className="underline underline-offset-2 hover:text-foreground"
            onClick={onReset}
          >
            Reset to default
          </button>
        </p>
      ) : null}

      <IpAddressPadDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        value={draft}
        onChange={setDraft}
        onSave={onSave}
        onDismiss={dismissDialog}
      />
    </>
  );
}

export function SetupDevicePage() {
  const { status, error, loading, connected } = useDeviceStatus();
  const {
    hostname,
    isOverridden,
    setHostname,
    resetHostname,
    defaultDeviceApiBase,
  } = useDeviceEndpoint();

  return (
    <SetupSectionLayout
      section={machineStatus}
      pinDescription={`Enter the setup PIN to view ${machineStatus.title.toLowerCase()}.`}
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3">
            Dispenser
            {loading ? (
              <Badge variant="outline">Checking…</Badge>
            ) : connected ? (
              <Badge className="gap-1.5">
                <Wifi className="size-3" />
                Connected
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1.5">
                <WifiOff className="size-3" />
                Offline
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            {isOverridden
              ? 'IPv4 address this kiosk uses to reach the pour controller.'
              : 'Using the build default (mDNS). Set an IP address if discovery fails.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl>
            <HostnameRow
              hostname={hostname}
              isOverridden={isOverridden}
              defaultDeviceApiBase={defaultDeviceApiBase}
              onSave={setHostname}
              onReset={resetHostname}
            />
            {connected ? (
              <StatusRow
                label="Firmware"
                value={status?.firmwareVersion ?? '—'}
              />
            ) : null}
            {!connected && error ? (
              <StatusRow label="Last error" value={error} />
            ) : null}
          </dl>
        </CardContent>
      </Card>
    </SetupSectionLayout>
  );
}
