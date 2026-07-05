import { useState, type ReactNode } from 'react';

import { MAX_ANTI_DRIP_MS, MAX_ML_PER_SECOND, MIN_ML_PER_SECOND } from '@/api/types';
import { NumberPadField } from '@/components/kiosk/number-pad-field';
import { maxDigitsForValue } from '@/components/kiosk/number-pad';
import { Label } from '@/components/ui/label';
import { useUpdatePumpCalibration } from '@/hooks/use-device-mutations';
import {
  SHOT_ML,
  estimatePourSeconds,
} from '@/lib/calibration';
import { deviceErrorMessage } from '@/lib/device-errors';
import { cn } from '@/lib/utils';

type PumpCalibrationFieldsProps = {
  pumpId: number;
  mlPerSecond: number;
  antiDripMs: number;
  fields?: 'both' | 'flowRate' | 'antiDrip';
  disabled?: boolean;
  onError?: (message: string) => void;
  className?: string;
};

type FieldKey = 'mlPerSecond' | 'antiDripMs';

function formatDisplay(field: FieldKey, value: number): string {
  return field === 'mlPerSecond' ? value.toFixed(2) : String(Math.round(value));
}

function PumpCalibrationFieldsInner({
  pumpId,
  mlPerSecond,
  antiDripMs,
  fields = 'both',
  disabled = false,
  onError,
  className,
}: PumpCalibrationFieldsProps) {
  const [activeField, setActiveField] = useState<FieldKey | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState<FieldKey | null>(null);
  const updatePumpCalibration = useUpdatePumpCalibration();

  const closeEditor = () => {
    setActiveField(null);
    setDraft('');
  };

  const openEditor = (field: FieldKey) => {
    if (disabled || saving !== null) return;
    setActiveField(field);
    setDraft(
      formatDisplay(field, field === 'mlPerSecond' ? mlPerSecond : antiDripMs),
    );
  };

  const saveField = async () => {
    if (activeField === null) return;

    const parsed = Number(draft);
    if (!Number.isFinite(parsed) || draft.trim() === '') {
      onError?.(
        activeField === 'mlPerSecond'
          ? 'Enter a valid flow rate'
          : 'Enter a valid anti-drip time',
      );
      return;
    }

    if (activeField === 'mlPerSecond') {
      if (parsed <= 0) {
        onError?.('Flow rate must be greater than 0 ml/s');
        return;
      }
      if (parsed < MIN_ML_PER_SECOND || parsed > MAX_ML_PER_SECOND) {
        onError?.(
          `Flow rate must be between ${MIN_ML_PER_SECOND} and ${MAX_ML_PER_SECOND} ml/s`,
        );
        return;
      }
    }

    if (activeField === 'antiDripMs' && (parsed < 0 || parsed > MAX_ANTI_DRIP_MS)) {
      onError?.(`Anti-drip must be between 0 and ${MAX_ANTI_DRIP_MS} ms`);
      return;
    }

    const nextMlPerSecond =
      activeField === 'mlPerSecond' ? parsed : mlPerSecond;
    const nextAntiDripMs =
      activeField === 'antiDripMs' ? Math.round(parsed) : antiDripMs;

    if (nextMlPerSecond === mlPerSecond && nextAntiDripMs === antiDripMs) {
      closeEditor();
      return;
    }

    setSaving(activeField);
    try {
      await updatePumpCalibration.mutateAsync({
        pumpId,
        mlPerSecond: nextMlPerSecond,
        antiDripMs: nextAntiDripMs,
      });
      closeEditor();
    } catch (err) {
      onError?.(deviceErrorMessage(err));
    } finally {
      setSaving(null);
    }
  };

  const renderField = (
    field: FieldKey,
    label: ReactNode,
    currentValue: number,
    suffix: string,
    inputId: string,
    dialogTitle: string,
    dialogDescription: string,
    maxLength: number,
    allowDecimal: boolean,
    hideLabel = false,
    hint?: ReactNode,
  ) => (
    <NumberPadField
      id={inputId}
      label={label}
      hideLabel={hideLabel}
      hint={hint}
      displayValue={formatDisplay(field, currentValue)}
      suffix={suffix}
      open={activeField === field}
      onOpenChange={(open) => {
        if (!open) closeEditor();
      }}
      draft={draft}
      onDraftChange={setDraft}
      onOpen={() => { openEditor(field); }}
      onSave={() => void saveField()}
      onCancel={closeEditor}
      dialogTitle={dialogTitle}
      dialogDescription={dialogDescription}
      disabled={disabled || (saving !== null && saving !== field)}
      saving={saving === field}
      maxLength={maxLength}
      allowDecimal={allowDecimal}
    />
  );

  const shotPourSeconds = Math.round(estimatePourSeconds(SHOT_ML, mlPerSecond));
  const shotHint = `${shotPourSeconds}s / shot`;

  const showFlowRate = fields === 'both' || fields === 'flowRate';
  const showAntiDrip = fields === 'both' || fields === 'antiDrip';

  const flowRateInputId = `pump-${pumpId}-ml-per-s`;
  const antiDripInputId = `pump-${pumpId}-anti-drip`;

  if (fields === 'both') {
    return (
      <div
        className={cn('grid grid-cols-2 gap-x-3 gap-y-2', className)}
      >
        <Label htmlFor={flowRateInputId}>Flow rate</Label>
        <Label htmlFor={antiDripInputId}>Anti-drip</Label>
        {renderField(
          'mlPerSecond',
          'Flow rate',
          mlPerSecond,
          'ml/s',
          flowRateInputId,
          'Flow rate',
          `Enter pump flow rate (${MAX_ML_PER_SECOND} ml/s max).`,
          maxDigitsForValue(MAX_ML_PER_SECOND) + 3,
          true,
          true,
          shotHint,
        )}
        {renderField(
          'antiDripMs',
          'Anti-drip',
          antiDripMs,
          'ms',
          antiDripInputId,
          'Anti-drip',
          `Enter anti-drip delay (0–${MAX_ANTI_DRIP_MS} ms).`,
          maxDigitsForValue(MAX_ANTI_DRIP_MS),
          false,
          true,
        )}
      </div>
    );
  }

  return (
    <div className={cn('max-w-sm', className)}>
      {showFlowRate
        ? renderField(
            'mlPerSecond',
            'Flow rate',
            mlPerSecond,
            'ml/s',
            flowRateInputId,
            'Flow rate',
            `Enter pump flow rate (${MAX_ML_PER_SECOND} ml/s max).`,
            maxDigitsForValue(MAX_ML_PER_SECOND) + 3,
            true,
            false,
            shotHint,
          )
        : null}
      {showAntiDrip
        ? renderField(
            'antiDripMs',
            'Anti-drip',
            antiDripMs,
            'ms',
            antiDripInputId,
            'Anti-drip',
            `Enter anti-drip delay (0–${MAX_ANTI_DRIP_MS} ms).`,
            maxDigitsForValue(MAX_ANTI_DRIP_MS),
            false,
          )
        : null}
    </div>
  );
}

export function PumpCalibrationFields(props: PumpCalibrationFieldsProps) {
  return (
    <PumpCalibrationFieldsInner
      key={`${props.pumpId}-${props.mlPerSecond}-${props.antiDripMs}`}
      {...props}
    />
  );
}
