import { type ReactNode } from 'react';

import { NumberPadDialog } from '@/components/kiosk/number-pad-dialog';
import { NumberPadTrigger } from '@/components/kiosk/number-pad-trigger';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type NumberPadFieldProps = {
  id: string;
  label: ReactNode;
  displayValue: string;
  suffix: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: string;
  onDraftChange: (value: string) => void;
  onOpen: () => void;
  onSave: () => void;
  onCancel: () => void;
  dialogTitle: string;
  dialogDescription?: string;
  disabled?: boolean;
  saving?: boolean;
  maxLength?: number;
  allowDecimal?: boolean;
  trailing?: ReactNode;
  hideLabel?: boolean;
  hint?: ReactNode;
  labelClassName?: string;
  className?: string;
};

export function NumberPadField({
  id,
  label,
  displayValue,
  suffix,
  open,
  onOpenChange,
  draft,
  onDraftChange,
  onOpen,
  onSave,
  onCancel,
  dialogTitle,
  dialogDescription,
  disabled = false,
  saving = false,
  maxLength,
  allowDecimal = false,
  trailing,
  hideLabel = false,
  hint,
  labelClassName,
  className,
}: NumberPadFieldProps) {
  return (
    <div className={cn(hideLabel && !hint ? 'space-y-0' : 'space-y-2', className)}>
      {hideLabel ? null : (
        <Label htmlFor={id} className={labelClassName}>
          {label}
        </Label>
      )}
      <div className="flex items-center gap-2">
        <NumberPadTrigger
          id={id}
          displayValue={displayValue}
          suffix={suffix}
          open={open}
          disabled={disabled || saving}
          onClick={onOpen}
        />
        {trailing}
      </div>
      {hint ? (
        <p className="text-xs tabular-nums text-muted-foreground">{hint}</p>
      ) : null}

      <NumberPadDialog
        open={open}
        onOpenChange={onOpenChange}
        title={dialogTitle}
        description={dialogDescription}
        value={draft}
        onChange={onDraftChange}
        onSave={onSave}
        onCancel={onCancel}
        saving={saving}
        suffix={suffix}
        maxLength={maxLength}
        allowDecimal={allowDecimal}
      />
    </div>
  );
}
