import { NumberPad } from '@/components/kiosk/number-pad';
import { cn } from '@/lib/utils';

type PinPadProps = {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  error?: boolean;
  className?: string;
};

function PinDisplay({
  length,
  filled,
  error,
}: {
  length: number;
  filled: number;
  error?: boolean;
}) {
  return (
    <div
      className="flex justify-center gap-4"
      aria-label={`${filled} of ${length} digits entered`}
    >
      {Array.from({ length }, (_, i) => (
        <span
          key={i}
          className={cn(
            'size-4 rounded-full border-2 transition-colors',
            i < filled
              ? error
                ? 'border-destructive bg-destructive'
                : 'border-primary bg-primary'
              : 'border-muted-foreground/40 bg-transparent',
          )}
        />
      ))}
    </div>
  );
}

export function PinPad({
  length = 4,
  value,
  onChange,
  onComplete,
  disabled = false,
  error = false,
  className,
}: PinPadProps) {
  return (
    <div className={cn('space-y-6', className)}>
      <PinDisplay length={length} filled={value.length} error={error} />

      <NumberPad
        value={value}
        onChange={onChange}
        onComplete={onComplete}
        disabled={disabled}
        maxLength={length}
        ariaLabel="PIN number pad"
      />
    </div>
  );
}

export function PinPadWithError({ error, ...props }: PinPadProps) {
  return (
    <div className="space-y-2">
      <div
        className={cn(
          'rounded-xl border px-4 py-6',
          error ? 'border-destructive/50 bg-destructive/5' : 'border-border/60',
        )}
      >
        <PinPad {...props} error={error} />
      </div>
      {error && (
        <p className="text-center text-sm text-destructive" role="alert">
          Wrong PIN — try again
        </p>
      )}
    </div>
  );
}
