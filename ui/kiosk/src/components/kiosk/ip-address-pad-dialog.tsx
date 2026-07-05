import { IpAddressPad } from '@/components/kiosk/ip-address-pad';
import {
  PadDialogFooter,
  PadDialogShell,
} from '@/components/kiosk/pad-dialog-shell';
import { isValidIpv4 } from '@/lib/ip-address';

export type IpAddressPadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onChange: (value: string) => void;
  onSave: (ipAddress: string) => void;
  /** Reset draft when the operator cancels or dismisses without saving. */
  onDismiss: () => void;
  saving?: boolean;
  className?: string;
};

export function ipAddressPadCanSave(value: string): boolean {
  return isValidIpv4(value);
}

export function IpAddressPadDialog({
  open,
  onOpenChange,
  value,
  onChange,
  onSave,
  onDismiss,
  saving = false,
  className,
}: IpAddressPadDialogProps) {
  const canSave = ipAddressPadCanSave(value);

  const dismiss = () => {
    onDismiss();
    onOpenChange(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      dismiss();
      return;
    }
    onOpenChange(true);
  };

  const handleSave = () => {
    if (!canSave) return;
    onSave(value);
    onOpenChange(false);
  };

  return (
    <PadDialogShell
      open={open}
      onOpenChange={handleOpenChange}
      title="IP address"
      description="Enter the dispenser address on your home network."
      className={className}
      footer={
        <PadDialogFooter
          onCancel={dismiss}
          onSave={handleSave}
          saving={saving}
          saveDisabled={!canSave}
        />
      }
    >
      <div className="space-y-3 rounded-xl border border-border/60 px-4 py-6">
        <IpAddressPad value={value} onChange={onChange} disabled={saving} />
        {value.length > 0 && !canSave ? (
          <p className="text-center text-sm text-destructive">
            Enter a valid IP address
          </p>
        ) : null}
      </div>
    </PadDialogShell>
  );
}
