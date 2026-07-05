import { NumberPad, NumberValueDisplay } from '@/components/kiosk/number-pad';
import {
  PadDialogFooter,
  PadDialogShell,
} from '@/components/kiosk/pad-dialog-shell';

export type NumberPadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving?: boolean;
  suffix?: string;
  maxLength?: number;
  allowDecimal?: boolean;
  className?: string;
};

export function NumberPadDialog({
  open,
  onOpenChange,
  title,
  description,
  value,
  onChange,
  onSave,
  onCancel,
  saving = false,
  suffix,
  maxLength,
  allowDecimal = false,
  className,
}: NumberPadDialogProps) {
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) onCancel();
    onOpenChange(nextOpen);
  };

  return (
    <PadDialogShell
      open={open}
      onOpenChange={handleOpenChange}
      title={title}
      description={description}
      className={className}
      footer={
        <PadDialogFooter
          onCancel={onCancel}
          onSave={onSave}
          saving={saving}
        />
      }
    >
      <div className="space-y-6 rounded-xl border border-border/60 px-4 py-6">
        <NumberValueDisplay value={value} suffix={suffix} />
        <NumberPad
          value={value}
          onChange={onChange}
          disabled={saving}
          maxLength={maxLength}
          allowDecimal={allowDecimal}
        />
      </div>
    </PadDialogShell>
  );
}
