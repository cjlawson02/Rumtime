import {
  useCallback,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';

import type { PumpJobPurpose } from '@/api/types';
import { fetchDeviceStatus, useDeviceStatus } from '@/hooks/use-device-status';
import {
  useCancelPumpDispense,
  useStartPumpDispense,
} from '@/hooks/use-device-mutations';
import { useLatestRef } from '@/hooks/use-latest-ref';
import { deviceErrorMessage } from '@/lib/device-errors';
import {
  createPumpPourTracker,
  markPumpPourDispenseStarted,
  resetPumpPourTracker,
  type PumpPourTracker,
} from '@/lib/pump-pour-lifecycle';
import { waitForPumpJobIdle } from '@/lib/wait-for-pump-idle';

export type StartRunOptions = {
  pumpId: number;
  purpose: PumpJobPurpose;
  durationSeconds?: number;
  ml?: number;
  tracker?: RefObject<PumpPourTracker>;
};

export function usePumpDispenseSession() {
  const queryClient = useQueryClient();
  const { status } = useDeviceStatus();
  const startPumpDispense = useStartPumpDispense();
  const cancelPumpDispense = useCancelPumpDispense();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const statusRef = useLatestRef(status);
  const defaultTrackerRef = useRef<PumpPourTracker>(createPumpPourTracker());

  const createTracker = useCallback(() => createPumpPourTracker(), []);

  const resolveTracker = useCallback(
    (tracker?: RefObject<PumpPourTracker>) =>
      tracker ?? defaultTrackerRef,
    [defaultTrackerRef],
  );

  const startRun = useCallback(
    async (options: StartRunOptions) => {
      const trackerRef = resolveTracker(options.tracker);
      setStarting(true);
      setError(null);
      try {
        let latest;
        try {
          latest = await fetchDeviceStatus(queryClient);
        } catch {
          setError('Could not verify device status — try again.');
          return;
        }

        if (
          latest.job?.state === 'pouring' ||
          latest.job?.state === 'prompt'
        ) {
          setError(
            'Machine is pouring a drink — wait for the pour to finish before running setup.',
          );
          return;
        }

        resetPumpPourTracker(trackerRef.current);
        await startPumpDispense.mutateAsync({
          pumpId: options.pumpId,
          purpose: options.purpose,
          ...(options.durationSeconds !== undefined && {
            durationSeconds: options.durationSeconds,
          }),
          ...(options.ml !== undefined && { ml: options.ml }),
        });
        await fetchDeviceStatus(queryClient);
        markPumpPourDispenseStarted(trackerRef.current);
      } catch (err) {
        resetPumpPourTracker(trackerRef.current);
        setError(deviceErrorMessage(err));
      } finally {
        setStarting(false);
      }
    },
    [queryClient, resolveTracker, startPumpDispense],
  );

  const stopRun = useCallback(
    async (options?: {
      tracker?: RefObject<PumpPourTracker>;
      resetTracker?: boolean;
      waitForIdle?: boolean | { pumpId?: number };
    }) => {
      setError(null);
      try {
        await cancelPumpDispense.mutateAsync();
        if (options?.waitForIdle) {
          const pumpId =
            typeof options.waitForIdle === 'object'
              ? options.waitForIdle.pumpId
              : undefined;
          await waitForPumpJobIdle(queryClient, { pumpId });
        }
      } catch (err) {
        setError(deviceErrorMessage(err));
        throw err;
      } finally {
        if (options?.resetTracker !== false && options?.tracker) {
          resetPumpPourTracker(options.tracker.current);
        }
      }
    },
    [cancelPumpDispense, queryClient],
  );

  const emergencyStop = useCallback(
    async (pumpId: number, onCancelRequested?: () => void) => {
      setError(null);
      const job = statusRef.current?.pumpJob;
      if (job?.pumpId === pumpId && job.state === 'running') {
        onCancelRequested?.();
      }
      try {
        await cancelPumpDispense.mutateAsync();
      } catch (err) {
        setError(deviceErrorMessage(err));
      }
    },
    [cancelPumpDispense, statusRef],
  );

  const closeWizard = useCallback(
    (
      onOpenChange: (open: boolean) => void,
      resetLocalState: () => void,
      options?: { pumpId?: number },
    ) => {
      const job = statusRef.current?.pumpJob;
      const shouldStop =
        job?.state === 'running' &&
        (options?.pumpId === undefined || job.pumpId === options.pumpId);

      if (shouldStop) {
        void cancelPumpDispense.mutateAsync().catch((err: unknown) => {
          console.error('Wizard cancel failed', err);
        });
      }
      onOpenChange(false);
      resetLocalState();
    },
    [cancelPumpDispense, statusRef],
  );

  return {
    starting,
    error,
    setError,
    startRun,
    stopRun,
    emergencyStop,
    closeWizard,
    createTracker,
    defaultTrackerRef,
    statusRef,
  };
}
