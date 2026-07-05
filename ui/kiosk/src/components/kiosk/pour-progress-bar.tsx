import {
  Progress,
  ProgressIndicator,
  ProgressTrack,
} from '@/components/ui/progress';
import { cn, roundProgressPercent } from '@/lib/utils';

type PourProgressBarProps = {
  value: number;
  label?: string;
  valueClassName?: string;
  indicatorClassName?: string;
};

export function PourProgressBar({
  value,
  label = 'Pour progress',
  valueClassName,
  indicatorClassName,
}: PourProgressBarProps) {
  const percent = roundProgressPercent(value);

  return (
    <div className="w-full max-w-lg space-y-3">
      <div className="flex justify-between text-base">
        <span className="font-medium">{label}</span>
        <span className={cn('tabular-nums text-primary', valueClassName)}>
          {percent}%
        </span>
      </div>
      <Progress value={percent} className="gap-0">
        <ProgressTrack className="h-3 bg-secondary">
          <ProgressIndicator
            className={cn(
              'rounded-full bg-gradient-to-r from-primary/80 to-primary',
              indicatorClassName,
            )}
          />
        </ProgressTrack>
      </Progress>
    </div>
  );
}
