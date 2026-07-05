import { type ReactNode } from 'react';

import { cn } from '@/lib/utils';

type NumberPadTriggerProps = {
  id?: string;
  displayValue: ReactNode;
  suffix: string;
  open?: boolean;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
  'aria-label'?: string;
};

export function NumberPadTrigger({
  id,
  displayValue,
  suffix,
  open = false,
  disabled = false,
  onClick,
  className,
  'aria-label': ariaLabel,
}: NumberPadTriggerProps) {
  return (
    <button
      id={id}
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        'kiosk-touch relative min-w-0 flex-1 rounded-xl border border-input bg-background px-4 text-left text-lg tabular-nums outline-none',
        'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
        'disabled:cursor-not-allowed disabled:opacity-50',
        open && 'border-ring ring-3 ring-ring/50',
        className,
      )}
    >
      {displayValue}
      <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-muted-foreground">
        {suffix}
      </span>
    </button>
  );
}
