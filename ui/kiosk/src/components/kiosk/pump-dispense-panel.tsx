import { Loader2 } from 'lucide-react';

import type { PumpJob, PumpJobPurpose } from '@/api/types';
import {
  Progress,
  ProgressIndicator,
  ProgressTrack,
} from '@/components/ui/progress';
import { useSmoothTimedProgress } from '@/hooks/use-smooth-timed-progress';
import { cn, roundProgressPercent } from '@/lib/utils';

export type PumpDispenseViewState = {
  active: boolean;
  isContinuous: boolean;
  progress: number;
  stepLabel: string;
  elapsedSeconds: number;
};

export function getPumpDispenseViewState(
  pumpId: number,
  pumpJob: PumpJob | null | undefined,
  purpose?: PumpJobPurpose,
): PumpDispenseViewState | null {
  if (!pumpJob || pumpJob.pumpId !== pumpId) {
    return null;
  }
  if (purpose !== undefined && pumpJob.purpose !== purpose) {
    return null;
  }

  return {
    active: pumpJob.state === 'running',
    isContinuous: Boolean(pumpJob.continuous),
    progress: roundProgressPercent(pumpJob.progress),
    stepLabel: pumpJob.stepLabel,
    elapsedSeconds: pumpJob.elapsedSeconds ?? 0,
  };
}

type PumpDispenseProgressProps = {
  pumpId: number;
  pumpJob: PumpJob | null | undefined;
  mlPerSecond?: number;
  className?: string;
  showPercent?: boolean;
};

export function PumpDispenseProgress({
  pumpId,
  pumpJob,
  mlPerSecond,
  className,
  showPercent = true,
}: PumpDispenseProgressProps) {
  const state = getPumpDispenseViewState(pumpId, pumpJob);
  const smoothProgress = useSmoothTimedProgress(pumpJob, mlPerSecond);

  if (!state?.active || state.isContinuous) {
    return null;
  }

  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <Progress value={smoothProgress} className="min-w-0 flex-1 gap-0">
        <ProgressTrack className="h-2 bg-secondary">
          <ProgressIndicator className="rounded-full bg-primary transition-none" />
        </ProgressTrack>
      </Progress>
      {showPercent ? (
        <span className="w-10 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
          {roundProgressPercent(smoothProgress)}%
        </span>
      ) : null}
    </div>
  );
}

type PumpDispenseStatusProps = {
  pumpId: number;
  pumpJob: PumpJob | null | undefined;
  mlPerSecond?: number;
  continuous?: boolean;
  continuousHint?: string;
  idleDescription?: string;
};

export function PumpDispenseStatus({
  pumpId,
  pumpJob,
  mlPerSecond,
  continuous = false,
  continuousHint = 'stop when the nozzle is wet',
  idleDescription,
}: PumpDispenseStatusProps) {
  const state = getPumpDispenseViewState(pumpId, pumpJob);
  const isContinuous = continuous || state?.isContinuous;

  if (state?.active) {
    const showTimedProgress = !isContinuous;

    return (
      <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-6 py-8 text-center">
        {isContinuous ? (
          <Loader2 className="size-12 animate-spin text-primary" />
        ) : null}
        <p className="text-xl">{state.stepLabel}</p>
        {isContinuous ? (
          <p className="text-lg tabular-nums text-muted-foreground">
            {state.elapsedSeconds}s — {continuousHint}
          </p>
        ) : null}
        {showTimedProgress && (
          <PumpDispenseProgress
            pumpId={pumpId}
            pumpJob={pumpJob}
            mlPerSecond={mlPerSecond}
            className="w-full max-w-lg"
          />
        )}
      </div>
    );
  }

  if (idleDescription) {
    return (
      <div className="mx-auto max-w-lg py-4 text-center">
        <p className="text-lg leading-relaxed text-muted-foreground">
          {idleDescription}
        </p>
      </div>
    );
  }

  return null;
}
