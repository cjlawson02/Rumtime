import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Droplets } from 'lucide-react';

import {
  getPumpDispenseViewState,
  PumpDispenseStatus,
} from '@/components/kiosk/pump-dispense-panel';
import {
  SetupWizardShell,
  WizardFooterActions,
} from '@/components/kiosk/setup-wizard-shell';
import { WizardErrorBanner } from '@/components/kiosk/wizard-error-banner';
import { useDeviceStatus } from '@/hooks/use-device-status';
import {
  useUpdatePrimed,
} from '@/hooks/use-device-mutations';
import { usePumpDispenseSession } from '@/hooks/use-pump-dispense-session';
import { MAX_PRIME_SECONDS } from '@/lib/calibration';
import { deviceErrorMessage } from '@/lib/device-errors';
import { findPumpSlot } from '@/lib/pumps';
import {
  resetPumpPourTracker,
  resolvePumpPourOutcome,
  type PumpPourTracker,
} from '@/lib/pump-pour-lifecycle';

const STEPS = [
  { id: 'prepare', title: 'Get ready to prime' },
  { id: 'run', title: 'Prime until the nozzle is wet' },
  { id: 'done', title: 'Line primed' },
] as const;

type PrimeWizardProps = {
  open: boolean;
  pumpId: number;
  onOpenChange: (open: boolean) => void;
  ingredientName: (ingredientId: string) => string;
};

export function PrimeWizard(props: PrimeWizardProps) {
  if (!props.open) return null;
  return <PrimeWizardSession {...props} />;
}

function PrimeWizardSession({
  pumpId,
  onOpenChange,
  ingredientName,
}: PrimeWizardProps) {
  const { status } = useDeviceStatus();
  const updatePrimed = useUpdatePrimed();
  const {
    starting,
    error,
    setError,
    startRun,
    stopRun,
    emergencyStop,
    closeWizard: closeDispenseSession,
    createTracker,
  } = usePumpDispenseSession();
  const [stepIndex, setStepIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const completingRef = useRef(false);
  const primePourRef = useRef<PumpPourTracker>(createTracker());

  const selectedPump = useMemo(
    () => findPumpSlot(status?.pumps, pumpId),
    [status?.pumps, pumpId],
  );

  const ingredientId = selectedPump?.ingredientId ?? null;
  const dispense = getPumpDispenseViewState(pumpId, status?.pumpJob, 'prime');
  const step = STEPS[stepIndex];

  const resetWizard = useCallback(() => {
    resetPumpPourTracker(primePourRef.current);
    completingRef.current = false;
    setStepIndex(0);
    setError(null);
  }, [setError]);

  const closeWizard = useCallback(() => {
    closeDispenseSession(onOpenChange, resetWizard, { pumpId });
  }, [closeDispenseSession, onOpenChange, pumpId, resetWizard]);

  useEffect(() => {
    if (step.id !== 'run' || completingRef.current) return;

    const outcome = resolvePumpPourOutcome(
      primePourRef.current,
      pumpId,
      'prime',
      status?.pumpJob,
    );
    if (outcome === null || outcome === 'running') return;

    resetPumpPourTracker(primePourRef.current);
    if (outcome === 'cancelled') {
      setError(
        `Priming stopped — check the line or try again (max ${MAX_PRIME_SECONDS}s).`,
      );
    }
  }, [status?.pumpJob, pumpId, step.id, setError]);

  const markPrimed = async () => {
    if (!ingredientId) return;
    await updatePrimed.mutateAsync({ ingredientId, primed: true });
  };

  const startPrimeRun = () =>
    startRun({ pumpId, purpose: 'prime', tracker: primePourRef });

  const finishPrime = async () => {
    if (completingRef.current) return;
    setError(null);
    completingRef.current = true;
    setFinishing(true);
    resetPumpPourTracker(primePourRef.current);
    try {
      await stopRun({
        tracker: primePourRef,
        resetTracker: false,
        waitForIdle: { pumpId },
      });
      await markPrimed();
      setStepIndex(2);
    } catch (err) {
      setError(deviceErrorMessage(err));
    } finally {
      completingRef.current = false;
      setFinishing(false);
    }
  };

  const footer = (() => {
    if (step.id === 'prepare') {
      return (
        <WizardFooterActions
          showBack={false}
          onNext={() => {
            setStepIndex(1);
            void startPrimeRun();
          }}
          nextLabel={starting ? 'Starting…' : 'Start priming'}
          nextDisabled={starting}
        />
      );
    }

    if (step.id === 'run') {
      if (dispense?.active) {
        return (
          <WizardFooterActions
            backLabel="Emergency stop"
            backVariant="destructive"
            onBack={() =>
              void emergencyStop(pumpId, () => {
                primePourRef.current.cancelRequested = true;
              })
            }
            onNext={() => void finishPrime()}
            nextLabel={finishing ? 'Stopping…' : 'Nozzle is wet'}
            nextDisabled={finishing}
          />
        );
      }

      return (
        <WizardFooterActions
          onBack={() => { setStepIndex(0); }}
          onNext={() => void startPrimeRun()}
          nextLabel={starting ? 'Starting…' : 'Start priming'}
          nextDisabled={starting}
        />
      );
    }

    return (
      <WizardFooterActions
        showBack={false}
        onNext={() => {
          closeWizard();
        }}
        nextLabel="Done"
      />
    );
  })();

  return (
    <SetupWizardShell
      open
      title={`Prime line ${pumpId}`}
      stepIndex={stepIndex}
      stepCount={STEPS.length}
      stepTitle={step.title}
      onCancel={closeWizard}
      footer={footer}
    >
      <WizardErrorBanner error={error} />

      {step.id === 'prepare' && selectedPump?.ingredientId && (
        <div className="mx-auto max-w-xl space-y-4 text-lg leading-relaxed text-muted-foreground">
          <p>{ingredientName(selectedPump.ingredientId)}</p>
          <ol className="list-decimal space-y-3 pl-6">
            <li>Confirm the pickup tube reaches the liquid in the bottle.</li>
            <li>Place a spare glass under the nozzle.</li>
            <li>
              Tap <strong>Start priming</strong>, then{' '}
              <strong>Nozzle is wet</strong> when liquid reaches the nozzle.
            </li>
            <li>
              Safety cutoff after {MAX_PRIME_SECONDS} seconds if you forget to
              stop.
            </li>
          </ol>
        </div>
      )}

      {step.id === 'run' && (
        <PumpDispenseStatus
          pumpId={pumpId}
          pumpJob={status?.pumpJob}
          continuous
          idleDescription="Pump runs into the spare glass. Stop when liquid reaches the nozzle."
        />
      )}

      {step.id === 'done' && selectedPump?.ingredientId && (
        <div className="mx-auto flex max-w-xl flex-col items-center gap-6 py-8 text-center">
          <div className="rounded-full bg-primary/15 p-6 ring-1 ring-primary/30">
            <Droplets className="size-14 text-primary" />
          </div>
          <p className="text-2xl font-semibold">
            Line {pumpId} is marked primed
          </p>
          <p className="text-lg text-muted-foreground">
            {ingredientName(selectedPump.ingredientId)} is ready for calibration
            or recipe pours.
          </p>
        </div>
      )}
    </SetupWizardShell>
  );
}
