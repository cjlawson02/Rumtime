import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Gauge } from 'lucide-react';

import { PrimeWizard } from '@/components/kiosk/prime-wizard';
import { PumpCalibrationFields } from '@/components/kiosk/pump-calibration-fields';
import { NumberPad, NumberValueDisplay } from '@/components/kiosk/number-pad';
import {
  getPumpDispenseViewState,
  PumpDispenseProgress,
  PumpDispenseStatus,
} from '@/components/kiosk/pump-dispense-panel';
import {
  SetupWizardShell,
  WizardFooterActions,
} from '@/components/kiosk/setup-wizard-shell';
import { WizardErrorBanner } from '@/components/kiosk/wizard-error-banner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useDeviceStatus } from '@/hooks/use-device-status';
import {
  useUpdatePumpCalibration,
} from '@/hooks/use-device-mutations';
import { usePumpDispenseSession } from '@/hooks/use-pump-dispense-session';
import {
  CALIBRATION_SAMPLE_ML,
  DEFAULT_CALIBRATION_RUN_SECONDS,
  VERIFICATION_VOLUMES_ML,
  formatMlPerSecond,
  resolvePumpCalibration,
  validateMeasuredFlowRate,
} from '@/lib/calibration';
import { deviceErrorMessage } from '@/lib/device-errors';
import { findPumpSlot } from '@/lib/pumps';
import {
  resetPumpPourTracker,
  resolvePumpPourOutcome,
  type PumpPourTracker,
} from '@/lib/pump-pour-lifecycle';

const STEPS = [
  { id: 'run-cal', title: 'Run calibration pour' },
  { id: 'measure', title: 'Enter measured volume' },
  { id: 'save-rate', title: 'Save flow rate' },
  { id: 'verify', title: 'Verify test pours' },
  { id: 'anti-drip', title: 'Tune anti-drip' },
  { id: 'done', title: 'Calibration complete' },
] as const;

type StepId = (typeof STEPS)[number]['id'];

function stepIndexFor(id: StepId): number {
  return STEPS.findIndex((step) => step.id === id);
}

type CalibrationWizardProps = {
  open: boolean;
  pumpId: number;
  onOpenChange: (open: boolean) => void;
  ingredientName: (ingredientId: string) => string;
};

export function CalibrationWizard(props: CalibrationWizardProps) {
  if (!props.open) return null;
  return <CalibrationWizardSession {...props} />;
}

function CalibrationWizardSession({
  pumpId,
  onOpenChange,
  ingredientName,
}: CalibrationWizardProps) {
  const { status } = useDeviceStatus();
  const updatePumpCalibration = useUpdatePumpCalibration();
  const {
    starting,
    error,
    setError,
    startRun,
    emergencyStop,
    closeWizard: closeDispenseSession,
    createTracker,
    statusRef,
  } = usePumpDispenseSession();
  const [stepIndex, setStepIndex] = useState(0);
  const [measuredMl, setMeasuredMl] = useState('');
  const [savedMlPerSecond, setSavedMlPerSecond] = useState<number | null>(null);
  const [primeWizardOpen, setPrimeWizardOpen] = useState(false);
  const [savingRate, setSavingRate] = useState(false);
  const calibrationPourRef = useRef<PumpPourTracker>(createTracker());
  const verifyPourRef = useRef<PumpPourTracker>(createTracker());

  const measuredFlowRate = useMemo(() => {
    const parsed = Number(measuredMl);
    return validateMeasuredFlowRate(parsed, DEFAULT_CALIBRATION_RUN_SECONDS);
  }, [measuredMl]);

  const calculatedMlPerSecond = measuredFlowRate.ok
    ? measuredFlowRate.mlPerSecond
    : null;
  const measuredFlowError = measuredFlowRate.ok ? null : measuredFlowRate.error;

  const selectedPump = useMemo(
    () => findPumpSlot(status?.pumps, pumpId),
    [status?.pumps, pumpId],
  );
  const ingredientId = selectedPump?.ingredientId ?? null;
  const binding = ingredientId ? status?.bindings[ingredientId] : undefined;
  const calibration = selectedPump
    ? resolvePumpCalibration(selectedPump)
    : null;
  const primed = binding?.primed ?? false;

  const resetWizard = useCallback(() => {
    resetPumpPourTracker(calibrationPourRef.current);
    resetPumpPourTracker(verifyPourRef.current);
    setStepIndex(0);
    setError(null);
    setMeasuredMl('');
    setSavedMlPerSecond(null);
    setPrimeWizardOpen(false);
    setSavingRate(false);
  }, [setError]);

  const stopDispense = useCallback(
    () =>
      emergencyStop(pumpId, () => {
        const job = statusRef.current?.pumpJob;
        if (job?.purpose === 'calibration') {
          calibrationPourRef.current.cancelRequested = true;
        }
        if (job?.purpose === 'verify') {
          verifyPourRef.current.cancelRequested = true;
        }
      }),
    [emergencyStop, pumpId, statusRef],
  );

  const closeWizard = useCallback(() => {
    closeDispenseSession(onOpenChange, resetWizard, { pumpId });
  }, [closeDispenseSession, onOpenChange, pumpId, resetWizard]);

  const pumpJob = status?.pumpJob ?? null;
  const verifyDispenseActive =
    pumpJob !== null &&
    pumpJob.pumpId === pumpId &&
    pumpJob.purpose === 'verify' &&
    pumpJob.state === 'running';
  const activeVerifyMl = verifyDispenseActive ? pumpJob.targetMl : undefined;
  const verifyMlPerSecond = savedMlPerSecond ?? calibration?.mlPerSecond;

  const calibrationDispense = getPumpDispenseViewState(
    pumpId,
    status?.pumpJob,
    'calibration',
  );

  useEffect(() => {
    if (stepIndex !== stepIndexFor('run-cal')) return;

    const outcome = resolvePumpPourOutcome(
      calibrationPourRef.current,
      pumpId,
      'calibration',
      status?.pumpJob,
    );
    if (outcome === 'finished') {
      resetPumpPourTracker(calibrationPourRef.current);
      setStepIndex(stepIndexFor('measure'));
    }
    if (outcome === 'cancelled') {
      resetPumpPourTracker(calibrationPourRef.current);
      setError('Calibration run stopped.');
    }
  }, [status?.pumpJob, pumpId, stepIndex]);

  useEffect(() => {
    const onVerifyStep =
      stepIndex === stepIndexFor('verify') ||
      stepIndex === stepIndexFor('anti-drip');
    if (!onVerifyStep) return;

    const outcome = resolvePumpPourOutcome(
      verifyPourRef.current,
      pumpId,
      'verify',
      status?.pumpJob,
    );
    if (outcome === 'finished') {
      resetPumpPourTracker(verifyPourRef.current);
    }
    if (outcome === 'cancelled') {
      resetPumpPourTracker(verifyPourRef.current);
      setError('Test pour stopped.');
    }
  }, [status?.pumpJob, pumpId, stepIndex]);

  const startCalibrationRun = () => {
    if (!pumpId || !primed) return;
    void startRun({
      pumpId,
      purpose: 'calibration',
      durationSeconds: DEFAULT_CALIBRATION_RUN_SECONDS,
      tracker: calibrationPourRef,
    });
  };

  const startVerifyPour = (ml: number) => {
    if (!pumpId || !primed) {
      setError('Line must be primed before pouring.');
      return;
    }
    void startRun({
      pumpId,
      purpose: 'verify',
      ml,
      tracker: verifyPourRef,
    });
  };

  const saveFlowRate = async () => {
    if (!pumpId || calculatedMlPerSecond === null || !calibration) return;
    setSavingRate(true);
    setError(null);
    try {
      await updatePumpCalibration.mutateAsync({
        pumpId,
        mlPerSecond: calculatedMlPerSecond,
        antiDripMs: calibration.antiDripMs,
      });
      setSavedMlPerSecond(calculatedMlPerSecond);
      setStepIndex(stepIndexFor('verify'));
    } catch (err) {
      setError(deviceErrorMessage(err));
    } finally {
      setSavingRate(false);
    }
  };

  const goToStep = (id: StepId) => { setStepIndex(stepIndexFor(id)); };

  const step = STEPS[stepIndex];

  const footer = (() => {
    if (step.id === 'run-cal') {
      if (calibrationDispense?.active) {
        return (
          <WizardFooterActions
            showBack={false}
            onNext={() => void stopDispense()}
            nextLabel="Stop"
          />
        );
      }

      return (
        <WizardFooterActions
          showBack={false}
          onNext={() => void startCalibrationRun()}
          nextLabel={
            starting
              ? 'Starting…'
              : `Run ${DEFAULT_CALIBRATION_RUN_SECONDS}s pour`
          }
          nextDisabled={!primed || starting}
        />
      );
    }

    if (
      (step.id === 'verify' || step.id === 'anti-drip') &&
      verifyDispenseActive
    ) {
      return (
        <WizardFooterActions
          showBack={false}
          onNext={() => void stopDispense()}
          nextLabel="Stop"
        />
      );
    }

    if (step.id === 'done') {
      return (
        <WizardFooterActions
          showBack={false}
          onNext={closeWizard}
          nextLabel="Done"
        />
      );
    }

    if (step.id === 'measure') {
      return (
        <WizardFooterActions
          onBack={() => { goToStep('run-cal'); }}
          onNext={() => { goToStep('save-rate'); }}
          nextDisabled={calculatedMlPerSecond === null}
          nextLabel="Review flow rate"
        />
      );
    }

    if (step.id === 'save-rate') {
      return (
        <WizardFooterActions
          onBack={() => { goToStep('measure'); }}
          onNext={() => void saveFlowRate()}
          nextDisabled={calculatedMlPerSecond === null || savingRate}
          nextLabel={savingRate ? 'Saving…' : 'Save flow rate'}
        />
      );
    }

    if (step.id === 'verify') {
      return (
        <WizardFooterActions
          onBack={() => { goToStep('save-rate'); }}
          onNext={() => { goToStep('anti-drip'); }}
          nextLabel="Continue to anti-drip"
        />
      );
    }

    return (
      <WizardFooterActions
        onBack={() => { goToStep('verify'); }}
        onNext={() => { goToStep('done'); }}
        nextLabel="Finish calibration"
      />
    );
  })();

  const verifyPourDisabled = starting || verifyDispenseActive || !primed;

  return (
    <>
      <SetupWizardShell
        open
        title={`Calibrate line ${pumpId}`}
        stepIndex={stepIndex}
        stepCount={STEPS.length}
        stepTitle={step.title}
        onCancel={closeWizard}
        footer={footer}
      >
        <WizardErrorBanner error={error} />

        {step.id === 'run-cal' && selectedPump && (
          <div className="mx-auto max-w-xl space-y-6">
            {!calibrationDispense?.active && (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-lg text-muted-foreground">
                    Line {selectedPump.pumpId} ·{' '}
                    {selectedPump.ingredientId
                      ? ingredientName(selectedPump.ingredientId)
                      : 'Unassigned'}
                  </span>
                  <Badge variant={primed ? 'default' : 'destructive'}>
                    {primed ? 'Primed' : 'Needs prime'}
                  </Badge>
                  <Button
                    type="button"
                    variant="outline"
                    className="kiosk-touch"
                    onClick={() => { setPrimeWizardOpen(true); }}
                  >
                    {primed ? 'Re-prime line' : 'Prime this line'}
                  </Button>
                </div>
                {!primed && (
                  <p className="text-muted-foreground">
                    Calibrating on a dry line gives bad numbers. Prime first, or
                    mark primed only if you already primed manually.
                  </p>
                )}
                <ol className="list-decimal space-y-3 pl-6 text-lg leading-relaxed text-muted-foreground">
                  <li>Use a spare glass or measuring cup under the nozzle.</li>
                  <li>
                    Run lasts {DEFAULT_CALIBRATION_RUN_SECONDS} seconds —
                    measure total output when it stops.
                  </li>
                  <li>
                    You will enter the volume on the next step to calculate
                    ml/s.
                  </li>
                </ol>
              </>
            )}
            <PumpDispenseStatus
              pumpId={pumpId}
              pumpJob={
                status?.pumpJob?.purpose === 'calibration'
                  ? status.pumpJob
                  : null
              }
              mlPerSecond={savedMlPerSecond ?? calibration?.mlPerSecond}
            />
          </div>
        )}

        {step.id === 'measure' && (
          <div className="mx-auto max-w-md space-y-6">
            <p className="text-muted-foreground">
              Run time was {DEFAULT_CALIBRATION_RUN_SECONDS} seconds. Enter the
              volume you measured.
            </p>
            <div className="space-y-4 rounded-xl border border-border/60 px-4 py-6">
              <Label>Measured output</Label>
              <NumberValueDisplay value={measuredMl} suffix="ml" />
              <NumberPad
                value={measuredMl}
                onChange={setMeasuredMl}
                allowDecimal
                maxLength={6}
                ariaLabel="Measured volume number pad"
              />
            </div>
            {calculatedMlPerSecond !== null && (
              <p className="rounded-xl border border-border/60 bg-secondary/50 px-4 py-3 text-lg tabular-nums">
                Suggested flow rate:{' '}
                <span className="font-semibold text-primary">
                  {formatMlPerSecond(calculatedMlPerSecond)}
                </span>
              </p>
            )}
            {measuredFlowError && (
              <p className="text-sm text-destructive">{measuredFlowError}</p>
            )}
          </div>
        )}

        {step.id === 'save-rate' && calculatedMlPerSecond !== null && (
          <div className="mx-auto max-w-md space-y-4 text-center">
            <div className="rounded-full bg-primary/15 p-6 ring-1 ring-primary/30 mx-auto w-fit">
              <Gauge className="size-14 text-primary" />
            </div>
            <p className="text-2xl font-semibold tabular-nums">
              {formatMlPerSecond(calculatedMlPerSecond)}
            </p>
            <p className="text-muted-foreground">
              From {measuredMl} ml in {DEFAULT_CALIBRATION_RUN_SECONDS} s on
              line {pumpId}
            </p>
          </div>
        )}

        {step.id === 'verify' && pumpId && (
          <div className="mx-auto max-w-xl space-y-6">
            <p className="text-center text-muted-foreground">
              Optional spot-check pours at common volumes.
              {savedMlPerSecond !== null && (
                <> Saved rate: {formatMlPerSecond(savedMlPerSecond)}.</>
              )}
            </p>
            {!primed && (
              <p className="text-center text-sm text-destructive">
                Line must be primed before test pours.
              </p>
            )}
            <div className="grid grid-cols-3 gap-4">
              {VERIFICATION_VOLUMES_ML.map((ml) => (
                <Button
                  key={ml}
                  type="button"
                  variant={activeVerifyMl === ml ? 'default' : 'outline'}
                  className="kiosk-touch h-20 text-2xl font-semibold tabular-nums"
                  disabled={verifyPourDisabled}
                  onClick={() => void startVerifyPour(ml)}
                >
                  {ml} ml
                </Button>
              ))}
            </div>
            {verifyDispenseActive && activeVerifyMl !== undefined ? (
              <PumpDispenseProgress
                pumpId={pumpId}
                pumpJob={pumpJob}
                mlPerSecond={verifyMlPerSecond}
                className="w-full"
              />
            ) : null}
          </div>
        )}

        {step.id === 'anti-drip' && selectedPump && calibration && (
          <div className="mx-auto max-w-xl space-y-6">
            <p className="text-lg leading-relaxed text-muted-foreground">
              Pour {CALIBRATION_SAMPLE_ML} ml, then watch the nozzle after the
              pump stops. Increase anti-drip if it drips; decrease if the next
              pour starts low (line de-primed).
            </p>
            {savedMlPerSecond !== null && (
              <p className="text-sm tabular-nums text-muted-foreground">
                Saved flow rate: {formatMlPerSecond(savedMlPerSecond)}
              </p>
            )}
            <Button
              type="button"
              variant={verifyDispenseActive ? 'default' : 'outline'}
              className="kiosk-touch"
              disabled={verifyPourDisabled}
              onClick={() => void startVerifyPour(CALIBRATION_SAMPLE_ML)}
            >
              Test pour {CALIBRATION_SAMPLE_ML} ml
            </Button>
            {verifyDispenseActive ? (
              <PumpDispenseProgress
                pumpId={pumpId}
                pumpJob={pumpJob}
                mlPerSecond={verifyMlPerSecond}
                className="w-full"
              />
            ) : null}
            <PumpCalibrationFields
              pumpId={selectedPump.pumpId}
              fields="antiDrip"
              mlPerSecond={savedMlPerSecond ?? calibration.mlPerSecond}
              antiDripMs={calibration.antiDripMs}
              onError={setError}
            />
          </div>
        )}

        {step.id === 'done' && selectedPump && (
          <div className="mx-auto max-w-xl py-8 text-center">
            <p className="text-2xl font-semibold">
              Line {selectedPump.pumpId} calibrated
            </p>
            <p className="mt-4 text-lg text-muted-foreground">
              {selectedPump.ingredientId
                ? ingredientName(selectedPump.ingredientId)
                : 'Unassigned'}{' '}
              flow rate and anti-drip are saved on the machine.
            </p>
          </div>
        )}
      </SetupWizardShell>

      <PrimeWizard
        open={primeWizardOpen}
        pumpId={pumpId}
        onOpenChange={setPrimeWizardOpen}
        ingredientName={ingredientName}
      />
    </>
  );
}
