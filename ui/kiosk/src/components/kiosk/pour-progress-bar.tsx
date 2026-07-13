import {
  Progress,
  ProgressIndicator,
  ProgressTrack,
} from '@/components/ui/progress';
import { roundProgressPercent } from '@/lib/utils';

type PourProgressBarProps = {
  value: number;
};

export function PourProgressBar({ value }: PourProgressBarProps) {
  const barValue = Math.min(100, Math.max(0, value));
  const displayPercent = roundProgressPercent(barValue);

  return (
    <div className="w-full max-w-lg space-y-3">
      <div className="flex justify-between text-base">
        <span className="font-medium">Pour progress</span>
        <span className="tabular-nums text-primary">{displayPercent}%</span>
      </div>
      <Progress value={barValue} className="gap-0">
        <ProgressTrack className="h-3 bg-secondary">
          <ProgressIndicator className="rounded-full bg-linear-to-r from-primary/80 to-primary transition-none" />
        </ProgressTrack>
      </Progress>
    </div>
  );
}
