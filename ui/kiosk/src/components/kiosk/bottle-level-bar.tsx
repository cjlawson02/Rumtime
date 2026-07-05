import { cn } from '@/lib/utils';

const DEFAULT_BOTTLE_ML = 750;

type BottleLevelBarProps = {
  remainingMl: number;
  bottleSizeMl?: number;
  className?: string;
};

export function bottleFillPercent(
  remainingMl: number,
  bottleSizeMl = DEFAULT_BOTTLE_ML,
): number {
  if (bottleSizeMl <= 0) return 0;
  return Math.min(100, Math.max(0, (remainingMl / bottleSizeMl) * 100));
}

export function BottleLevelBar({
  remainingMl,
  bottleSizeMl = DEFAULT_BOTTLE_ML,
  className,
}: BottleLevelBarProps) {
  const fillPercent = bottleFillPercent(remainingMl, bottleSizeMl);
  const emptyPercent = 100 - fillPercent;

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(fillPercent)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${Math.round(fillPercent)}% full`}
      className={cn(
        'relative h-3 w-full overflow-hidden rounded-full bg-muted',
        className,
      )}
    >
      <div
        className="absolute inset-0 bg-gradient-to-l from-green-500 to-red-500"
        aria-hidden
      />
      <div
        className="absolute inset-y-0 right-0 bg-muted"
        style={{ width: `${emptyPercent}%` }}
        aria-hidden
      />
    </div>
  );
}
