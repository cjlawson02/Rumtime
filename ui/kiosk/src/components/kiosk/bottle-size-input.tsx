import { useState } from 'react';

import { NumberPadDialog } from '@/components/kiosk/number-pad-dialog';
import { NumberPadTrigger } from '@/components/kiosk/number-pad-trigger';
import { maxDigitsForValue } from '@/components/kiosk/number-pad';
import {
  BOTTLE_SIZE_OPTIONS,
  isPresetBottleSize,
} from '@/data/pumped-ingredients';
import { useUpdateBottleSize } from '@/hooks/use-device-mutations';
import { Label } from '@/components/ui/label';
import { mutationErrorMessage } from '@/lib/device-errors';
import { KIOSK_SELECT_CLASSNAME } from '@/lib/kiosk-input-styles';
import { cn } from '@/lib/utils';

const CUSTOM_VALUE = 'custom';
const MAX_BOTTLE_ML = 5000;

type BottleSizeInputProps = {
  ingredientId: string;
  bottleSizeMl: number;
  inputId: string;
  disabled?: boolean;
  onSaved?: () => void | Promise<void>;
  onError?: (message: string) => void;
  className?: string;
};

function clampBottleSize(value: number): number {
  return Math.min(MAX_BOTTLE_ML, Math.max(1, Math.round(value)));
}

function selectValueForSize(ml: number): string {
  return isPresetBottleSize(ml) ? String(ml) : CUSTOM_VALUE;
}

function BottleSizeInputInner({
  ingredientId,
  bottleSizeMl,
  inputId,
  disabled = false,
  onSaved,
  onError,
  className,
}: BottleSizeInputProps) {
  const [selectValue, setSelectValue] = useState(() =>
    selectValueForSize(bottleSizeMl),
  );
  const [draft, setDraft] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const updateBottleSize = useUpdateBottleSize();

  const isCustom = selectValue === CUSTOM_VALUE;
  const maxLength = maxDigitsForValue(MAX_BOTTLE_ML);

  const saveSize = async (nextSize: number) => {
    if (nextSize === bottleSizeMl) {
      setDraft('');
      setDialogOpen(false);
      return;
    }

    setSaving(true);
    try {
      await updateBottleSize.mutateAsync({
        ingredientId,
        bottleSizeMl: nextSize,
      });
      setDraft('');
      setDialogOpen(false);
      await onSaved?.();
    } catch (err) {
      setSelectValue(selectValueForSize(bottleSizeMl));
      onError?.(
        mutationErrorMessage(err, 'Could not update bottle size'),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSelectChange = async (value: string) => {
    setSelectValue(value);

    if (value === CUSTOM_VALUE) {
      setDraft(String(bottleSizeMl));
      setDialogOpen(true);
      return;
    }

    setDraft('');
    setDialogOpen(false);
    await saveSize(Number(value));
  };

  const cancelCustom = () => {
    setSelectValue(selectValueForSize(bottleSizeMl));
    setDraft('');
    setDialogOpen(false);
  };

  const openCustomEditor = () => {
    if (disabled || saving || !isCustom) return;
    setDraft(String(bottleSizeMl));
    setDialogOpen(true);
  };

  const saveCustom = async () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      onError?.('Enter a valid bottle size in ml');
      return;
    }

    await saveSize(clampBottleSize(parsed));
  };

  return (
    <div className={cn('min-w-0 space-y-2', className)}>
      <Label htmlFor={inputId}>Bottle size</Label>
      <select
        id={inputId}
        className={KIOSK_SELECT_CLASSNAME}
        value={selectValue}
        disabled={disabled || saving}
        onChange={(event) => void handleSelectChange(event.target.value)}
      >
        {BOTTLE_SIZE_OPTIONS.map((option) => (
          <option key={option.ml} value={option.ml}>
            {option.label}
          </option>
        ))}
        <option value={CUSTOM_VALUE}>Custom…</option>
      </select>

      {isCustom && (
        <NumberPadTrigger
          displayValue={String(bottleSizeMl)}
          suffix="ml"
          open={dialogOpen}
          disabled={disabled || saving}
          onClick={openCustomEditor}
          className="w-full flex-none"
          aria-label="Custom bottle size in ml"
        />
      )}

      <NumberPadDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Bottle size"
        description={`Enter custom bottle volume (1–${MAX_BOTTLE_ML} ml).`}
        value={draft}
        onChange={setDraft}
        onSave={() => void saveCustom()}
        onCancel={cancelCustom}
        saving={saving}
        suffix="ml"
        maxLength={maxLength}
      />
    </div>
  );
}

export function BottleSizeInput(props: BottleSizeInputProps) {
  return (
    <BottleSizeInputInner
      key={`${props.ingredientId}-${props.bottleSizeMl}`}
      {...props}
    />
  );
}
