import {
  SHOT_ML,
  estimatePourSeconds,
  formatMlPerSecond,
} from '@/lib/calibration';
import { cn } from '@/lib/utils';

type PumpCalibrationMetricsProps = {
  mlPerSecond: number;
  antiDripMs: number;
  className?: string;
};

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">{label}</p>
      <p className="text-lg tabular-nums">{value}</p>
      {hint ? (
        <p className="text-xs tabular-nums text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function PumpCalibrationMetrics({
  mlPerSecond,
  antiDripMs,
  className,
}: PumpCalibrationMetricsProps) {
  const shotPourSeconds = Math.round(estimatePourSeconds(SHOT_ML, mlPerSecond));

  return (
    <div className={cn('flex flex-wrap gap-x-8 gap-y-2', className)}>
      <Metric
        label="Flow rate"
        value={formatMlPerSecond(mlPerSecond)}
        hint={`${shotPourSeconds}s / shot`}
      />
      <Metric label="Anti-drip" value={`${Math.round(antiDripMs)} ms`} />
    </div>
  );
}
