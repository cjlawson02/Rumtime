import { Delete } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

export type NumberPadProps = {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  maxLength?: number;
  allowDecimal?: boolean;
  /** IPv4-style dot separator (mutually exclusive with allowDecimal). */
  allowDot?: boolean;
  canAppendDigit?: (value: string, digit: string) => boolean;
  canAppendDot?: (value: string) => boolean;
  className?: string;
  ariaLabel?: string;
};

export function maxDigitsForValue(maxValue: number): number {
  return Math.max(1, String(maxValue).length);
}

export function NumberValueDisplay({
  value,
  suffix,
  className,
}: {
  value: string;
  suffix?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'text-center text-3xl font-medium tabular-nums tracking-tight',
        className,
      )}
      aria-live="polite"
    >
      {value || '0'}
      {suffix ? (
        <span className="ml-1 text-lg text-muted-foreground">{suffix}</span>
      ) : null}
    </div>
  );
}

export function NumberPad({
  value,
  onChange,
  onComplete,
  disabled = false,
  maxLength,
  allowDecimal = false,
  allowDot = false,
  canAppendDigit,
  canAppendDot,
  className,
  ariaLabel = 'Number pad',
}: NumberPadProps) {
  const atMax = maxLength !== undefined && value.length >= maxLength;
  const hasDecimal = value.includes('.');

  const append = (digit: string) => {
    if (disabled || atMax) return;
    if (canAppendDigit && !canAppendDigit(value, digit)) return;
    const next = value + digit;
    onChange(next);
    if (maxLength !== undefined && next.length === maxLength) {
      onComplete?.(next);
    }
  };

  const appendDecimal = () => {
    if (disabled || atMax || hasDecimal) return;
    const next = value.length === 0 ? '0.' : `${value}.`;
    onChange(next);
  };

  const appendDot = () => {
    if (disabled || atMax) return;
    if (canAppendDot && !canAppendDot(value)) return;
    onChange(`${value}.`);
  };

  const backspace = () => {
    if (disabled || value.length === 0) return;
    onChange(value.slice(0, -1));
  };

  const clear = () => {
    if (disabled || value.length === 0) return;
    onChange('');
  };

  const separatorButton = allowDot ? (
    <Button
      type="button"
      variant="outline"
      disabled={disabled || atMax || (canAppendDot ? !canAppendDot(value) : false)}
      className="kiosk-touch min-h-16 text-2xl font-medium"
      aria-label="Dot"
      onClick={appendDot}
    >
      .
    </Button>
  ) : allowDecimal ? (
    <Button
      type="button"
      variant="outline"
      disabled={disabled || atMax || hasDecimal}
      className="kiosk-touch min-h-16 text-2xl font-medium"
      aria-label="Decimal point"
      onClick={appendDecimal}
    >
      .
    </Button>
  ) : (
    <Button
      type="button"
      variant="ghost"
      disabled={disabled || value.length === 0}
      className="kiosk-touch min-h-16 text-base text-muted-foreground"
      onClick={clear}
    >
      Clear
    </Button>
  );

  return (
    <div className={cn('space-y-3', className)}>
      <div
        className="grid grid-cols-3 gap-3"
        role="group"
        aria-label={ariaLabel}
      >
        {DIGITS.map((digit) => (
          <Button
            key={digit}
            type="button"
            variant="outline"
            disabled={
              disabled ||
              atMax ||
              (canAppendDigit ? !canAppendDigit(value, digit) : false)
            }
            className="kiosk-touch min-h-16 text-2xl font-medium"
            onClick={() => { append(digit); }}
          >
            {digit}
          </Button>
        ))}

        <Button
          type="button"
          variant="outline"
          disabled={disabled || value.length === 0}
          className="kiosk-touch min-h-16"
          aria-label="Delete last digit"
          onClick={backspace}
        >
          <Delete className="size-6" />
        </Button>

        <Button
          type="button"
          variant="outline"
          disabled={
            disabled ||
            atMax ||
            (canAppendDigit ? !canAppendDigit(value, '0') : false)
          }
          className="kiosk-touch min-h-16 text-2xl font-medium"
          onClick={() => { append('0'); }}
        >
          0
        </Button>

        {separatorButton}
      </div>

      {allowDecimal || allowDot ? (
        <Button
          type="button"
          variant="ghost"
          disabled={disabled || value.length === 0}
          className="kiosk-touch min-h-12 w-full text-base text-muted-foreground"
          onClick={clear}
        >
          Clear
        </Button>
      ) : null}
    </div>
  );
}
