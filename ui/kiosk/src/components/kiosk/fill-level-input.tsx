import { useState, type ReactNode } from 'react';

import { NumberPadField } from '@/components/kiosk/number-pad-field';
import { maxDigitsForValue } from '@/components/kiosk/number-pad';
import { useUpdateInventoryLevel } from '@/hooks/use-device-mutations';
import { mutationErrorMessage } from '@/lib/device-errors';
import { cn } from '@/lib/utils';

type FillLevelInputProps = {
  ingredientId: string;
  remainingMl: number;
  bottleSizeMl: number;
  disabled?: boolean;
  onSaved?: () => void | Promise<void>;
  onError?: (message: string) => void;
  className?: string;
  trailing?: ReactNode;
};

function clampLevel(value: number, bottleSizeMl: number): number {
  return Math.min(bottleSizeMl, Math.max(0, Math.round(value)));
}

function FillLevelInputInner({
  ingredientId,
  remainingMl,
  bottleSizeMl,
  disabled = false,
  onSaved,
  onError,
  className,
  trailing,
}: FillLevelInputProps) {
  const [draft, setDraft] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const updateInventoryLevel = useUpdateInventoryLevel();

  const maxLength = maxDigitsForValue(bottleSizeMl);

  const openEditor = () => {
    if (disabled || saving) return;
    setDraft(String(remainingMl));
    setDialogOpen(true);
  };

  const cancel = () => {
    setDraft('');
    setDialogOpen(false);
  };

  const save = async () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      onError?.('Enter a valid fill level in ml');
      return;
    }

    const nextLevel = clampLevel(parsed, bottleSizeMl);
    if (nextLevel === remainingMl) {
      cancel();
      return;
    }

    setSaving(true);
    try {
      await updateInventoryLevel.mutateAsync({
        ingredientId,
        remainingMl: nextLevel,
      });
      cancel();
      await onSaved?.();
    } catch (err) {
      onError?.(
        mutationErrorMessage(err, 'Could not update fill level'),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <NumberPadField
      id={`fill-${ingredientId}`}
      label="Fill level"
      displayValue={String(remainingMl)}
      suffix="ml"
      open={dialogOpen}
      onOpenChange={setDialogOpen}
      draft={draft}
      onDraftChange={setDraft}
      onOpen={openEditor}
      onSave={() => void save()}
      onCancel={cancel}
      dialogTitle="Fill level"
      dialogDescription={`Enter remaining volume (0–${bottleSizeMl} ml).`}
      disabled={disabled}
      saving={saving}
      maxLength={maxLength}
      trailing={trailing}
      className={cn(className)}
    />
  );
}

export function FillLevelInput(props: FillLevelInputProps) {
  return (
    <FillLevelInputInner
      key={`${props.ingredientId}-${props.remainingMl}`}
      {...props}
    />
  );
}
