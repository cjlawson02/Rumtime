import { useCallback, useEffect, useRef, useState } from 'react';
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
import { useUpdatePrimed } from '@/hooks/use-device-mutations';
import { usePumpDispenseSession } from '@/hooks/use-pump-dispense-session';
import { MAX_PRIME_SECONDS } from '@/lib/calibration';
import { MAX_CLEANING_RUN_SECONDS } from '@/lib/cleaning';
import { deviceErrorMessage } from '@/lib/device-errors';
import {
  resetPumpPourTracker,
  resolvePumpPourOutcome,
  type PumpPourTracker,
} from '@/lib/pump-pour-lifecycle';

type Phase =
  | { kind: 'product-drain-run' }
  | { kind: 'flush-run' }
  | { kind: 'water-drain-run' }
  | { kind: 'prime-run' }
  | { kind: 'done' };

const ASSIGN_STEPS: Phase['kind'][] = [
  'product-drain-run',
  'flush-run',
  'water-drain-run',
  'prime-run',
  'done',
];

const UNASSIGN_STEPS: Phase['kind'][] = [
  'product-drain-run',
  'flush-run',
  'water-drain-run',
  'done',
];

function isRunPhase(phase: Phase): boolean {
  return (
    phase.kind === 'product-drain-run' ||
    phase.kind === 'flush-run' ||
    phase.kind === 'water-drain-run' ||
    phase.kind === 'prime-run'
  );
}

function runPurposeForPhase(phase: Phase): 'drain' | 'flush' | 'prime' | null {
  switch (phase.kind) {
    case 'product-drain-run':
    case 'water-drain-run':
      return 'drain';
    case 'flush-run':
      return 'flush';
    case 'prime-run':
      return 'prime';
    default:
      return null;
  }
}

function phaseTitle(
  phase: Phase,
  assigning: boolean,
  swapApplied: boolean,
  runActive: boolean,
): string {
  switch (phase.kind) {
    case 'product-drain-run':
      return 'Drain the old liquid';
    case 'flush-run':
      return 'Flush with water';
    case 'water-drain-run':
      return 'Purge the line dry';
    case 'prime-run':
      if (!runActive && !swapApplied) {
        return 'Connect the new bottle';
      }
      return 'Prime the new liquid';
    case 'done':
      return assigning ? 'Line ready' : 'Line stored dry';
  }
}

function stepIndexFor(phase: Phase, steps: Phase['kind'][]): number {
  return steps.indexOf(phase.kind);
}

type LineSwapWizardProps = {
  open: boolean;
  pumpId: number;
  fromIngredientId: string;
  toIngredientId: string | null;
  onOpenChange: (open: boolean) => void;
  onApplySwap: () => Promise<void>;
  ingredientName: (ingredientId: string) => string;
};

export function LineSwapWizard(props: LineSwapWizardProps) {
  if (!props.open) return null;
  return <LineSwapWizardSession {...props} />;
}

function LineSwapWizardSession({
  pumpId,
  fromIngredientId,
  toIngredientId,
  onOpenChange,
  onApplySwap,
  ingredientName,
}: LineSwapWizardProps) {
  const assigning = toIngredientId !== null;
  const steps = assigning ? ASSIGN_STEPS : UNASSIGN_STEPS;

  const { status } = useDeviceStatus();
  const updatePrimed = useUpdatePrimed();
  const {
    starting,
    error,
    setError,
    startRun,
    stopRun: stopDispenseRun,
    emergencyStop,
    closeWizard: closeDispenseSession,
    createTracker,
  } = usePumpDispenseSession();
  const [phase, setPhase] = useState<Phase>({ kind: 'product-drain-run' });
  const [swapApplied, setSwapApplied] = useState(false);
  const completingRef = useRef(false);
  const runPourRef = useRef<PumpPourTracker>(createTracker());

  const oldName = ingredientName(fromIngredientId);
  const newName = toIngredientId ? ingredientName(toIngredientId) : null;

  const dispense = getPumpDispenseViewState(pumpId, status?.pumpJob);
  const runPurpose = status?.pumpJob?.purpose;
  const phasePurpose = runPurposeForPhase(phase);
  const runActive = Boolean(
    isRunPhase(phase) && phasePurpose === runPurpose && dispense?.active,
  );

  const resetWizard = useCallback(() => {
    resetPumpPourTracker(runPourRef.current);
    setPhase({ kind: 'product-drain-run' });
    setError(null);
    setSwapApplied(false);
    completingRef.current = false;
  }, [setError]);

  useEffect(() => {
    if (completingRef.current || !isRunPhase(phase) || !phasePurpose) return;

    const outcome = resolvePumpPourOutcome(
      runPourRef.current,
      pumpId,
      phasePurpose,
      status?.pumpJob,
    );
    if (outcome === 'cancelled') {
      resetPumpPourTracker(runPourRef.current);
      const maxSeconds =
        phasePurpose === 'prime' ? MAX_PRIME_SECONDS : MAX_CLEANING_RUN_SECONDS;
      setError(
        `Run stopped — check the line or try again (max ${maxSeconds}s).`,
      );
    }
  }, [phase, phasePurpose, pumpId, setError, status?.pumpJob]);

  const startRunForPhase = (purpose: 'flush' | 'drain' | 'prime') =>
    startRun({ pumpId, purpose, tracker: runPourRef });

  const stopRun = async (options?: {
    resetTracker?: boolean;
    waitForIdle?: boolean | { pumpId?: number };
  }) => {
    completingRef.current = true;
    try {
      await stopDispenseRun({ tracker: runPourRef, ...options });
    } finally {
      completingRef.current = false;
    }
  };

  const closeWizard = useCallback(() => {
    closeDispenseSession(onOpenChange, resetWizard, { pumpId });
  }, [closeDispenseSession, onOpenChange, pumpId, resetWizard]);

  const markPrimed = async () => {
    if (!toIngredientId) return;
    await updatePrimed.mutateAsync({
      ingredientId: toIngredientId,
      primed: true,
    });
  };

  const applySwapIfNeeded = async () => {
    if (swapApplied) return;
    await onApplySwap();
    setSwapApplied(true);
  };

  const advance = useCallback(() => {
    setPhase((current) => {
      switch (current.kind) {
        case 'product-drain-run':
          return { kind: 'flush-run' };
        case 'flush-run':
          return { kind: 'water-drain-run' };
        case 'water-drain-run':
          return assigning ? { kind: 'prime-run' } : { kind: 'done' };
        case 'prime-run':
          return { kind: 'done' };
        default:
          return current;
      }
    });
  }, [assigning]);

  const footer = (() => {
    if (phase.kind === 'product-drain-run') {
      if (runActive) {
        return (
          <WizardFooterActions
            backLabel="Emergency stop"
            backVariant="destructive"
            onBack={() =>
              void emergencyStop(pumpId, () => {
                runPourRef.current.cancelRequested = true;
              })
            }
            onNext={() => {
              void (async () => {
                await stopRun();
                advance();
              })();
            }}
            nextLabel="Flow stopped"
          />
        );
      }

      return (
        <WizardFooterActions
          showBack={false}
          onNext={() => void startRunForPhase('drain')}
          nextLabel={starting ? 'Starting…' : 'Start drain'}
          nextDisabled={starting}
        />
      );
    }

    if (phase.kind === 'flush-run') {
      if (runActive) {
        return (
          <WizardFooterActions
            backLabel="Emergency stop"
            backVariant="destructive"
            onBack={() =>
              void emergencyStop(pumpId, () => {
                runPourRef.current.cancelRequested = true;
              })
            }
            onNext={() => {
              void (async () => {
                await stopRun();
                advance();
              })();
            }}
            nextLabel="Water at nozzle"
          />
        );
      }

      return (
        <WizardFooterActions
          onBack={() => { setPhase({ kind: 'product-drain-run' }); }}
          onNext={() => void startRunForPhase('flush')}
          nextLabel={starting ? 'Starting…' : 'Start flush'}
          nextDisabled={starting}
        />
      );
    }

    if (phase.kind === 'water-drain-run') {
      if (runActive) {
        return (
          <WizardFooterActions
            backLabel="Emergency stop"
            backVariant="destructive"
            onBack={() =>
              void emergencyStop(pumpId, () => {
                runPourRef.current.cancelRequested = true;
              })
            }
            onNext={() => {
              void (async () => {
                await stopRun();
                if (!assigning) {
                  try {
                    await applySwapIfNeeded();
                  } catch (err) {
                    setError(deviceErrorMessage(err));
                    return;
                  }
                }
                advance();
              })();
            }}
            nextLabel="Only air coming out"
          />
        );
      }

      return (
        <WizardFooterActions
          onBack={() => { setPhase({ kind: 'flush-run' }); }}
          onNext={() => void startRunForPhase('drain')}
          nextLabel={starting ? 'Starting…' : 'Start purge'}
          nextDisabled={starting}
        />
      );
    }

    if (phase.kind === 'prime-run') {
      if (runActive) {
        return (
          <WizardFooterActions
            backLabel="Emergency stop"
            backVariant="destructive"
            onBack={() =>
              void emergencyStop(pumpId, () => {
                runPourRef.current.cancelRequested = true;
              })
            }
            onNext={() => {
              void (async () => {
                try {
                  await stopRun({
                    resetTracker: false,
                    waitForIdle: { pumpId },
                  });
                  await markPrimed();
                  advance();
                } catch (err) {
                  setError(deviceErrorMessage(err));
                }
              })();
            }}
            nextLabel="Nozzle is wet"
          />
        );
      }

      return (
        <WizardFooterActions
          onBack={() => { setPhase({ kind: 'water-drain-run' }); }}
          onNext={() => {
            void (async () => {
              try {
                if (!swapApplied) {
                  await applySwapIfNeeded();
                }
                await startRunForPhase('prime');
              } catch (err) {
                setError(deviceErrorMessage(err));
              }
            })();
          }}
          nextLabel={
            starting
              ? 'Starting…'
              : swapApplied
                ? 'Start priming'
                : newName
                  ? `${newName} connected`
                  : 'Start priming'
          }
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

  const wizardTitle = assigning ? `Swap to ${newName}` : `Clear line ${pumpId}`;

  return (
    <SetupWizardShell
      open
      title={wizardTitle}
      stepIndex={Math.max(0, stepIndexFor(phase, steps))}
      stepCount={steps.length}
      stepTitle={phaseTitle(phase, assigning, swapApplied, runActive)}
      onCancel={closeWizard}
      footer={footer}
    >
      <WizardErrorBanner error={error} />

      {phase.kind === 'product-drain-run' &&
        (runActive ? (
          <PumpDispenseStatus
            pumpId={pumpId}
            pumpJob={status?.pumpJob}
            continuous
            continuousHint="stop when the flow stops"
          />
        ) : (
          <div className="mx-auto max-w-xl space-y-4 text-lg leading-relaxed text-muted-foreground">
            <p>
              Line {pumpId} is on <strong>{oldName}</strong>
              {newName ? (
                <>
                  {' '}
                  and will move to <strong>{newName}</strong>
                </>
              ) : null}
              .
            </p>
            <ol className="list-decimal space-y-3 pl-6">
              <li>Remove the pickup tube from the {oldName} bottle.</li>
              <li>Hold the tube over waste — do not put it in water yet.</li>
              <li>
                Tap <strong>Start drain</strong> to pump leftover liquid out of
                the line.
              </li>
            </ol>
          </div>
        ))}

      {phase.kind === 'flush-run' &&
        (runActive ? (
          <PumpDispenseStatus
            pumpId={pumpId}
            pumpJob={status?.pumpJob}
            continuous
            continuousHint="stop when water reaches the nozzle"
          />
        ) : (
          <div className="mx-auto max-w-xl space-y-4 text-lg leading-relaxed text-muted-foreground">
            <p>Most of the {oldName} should be out of the line.</p>
            <ol className="list-decimal space-y-3 pl-6">
              <li>Place the pickup tube in a jug of warm water.</li>
              <li>Keep a waste cup under the nozzle.</li>
              <li>
                Tap <strong>Start flush</strong> to run water through the line.
              </li>
            </ol>
          </div>
        ))}

      {phase.kind === 'water-drain-run' &&
        (runActive ? (
          <PumpDispenseStatus
            pumpId={pumpId}
            pumpJob={status?.pumpJob}
            continuous
            continuousHint="stop when only air comes out"
          />
        ) : (
          <div className="mx-auto max-w-xl space-y-4 text-lg leading-relaxed text-muted-foreground">
            <p>Water should be running clear at the nozzle.</p>
            <ol className="list-decimal space-y-3 pl-6">
              <li>Lift the pickup tube out of the water jug.</li>
              <li>Hold the tube over waste — do not connect a bottle yet.</li>
              <li>
                Tap <strong>Start purge</strong> to pump the line dry.
              </li>
            </ol>
          </div>
        ))}

      {phase.kind === 'prime-run' &&
        (runActive ? (
          <PumpDispenseStatus
            pumpId={pumpId}
            pumpJob={status?.pumpJob}
            continuous
          />
        ) : (
          newName && (
            <div className="mx-auto max-w-xl space-y-4 text-lg leading-relaxed text-muted-foreground">
              <p>The line should be empty and dry.</p>
              <ol className="list-decimal space-y-3 pl-6">
                <li>
                  Connect the pickup tube to the <strong>{newName}</strong>{' '}
                  bottle.
                </li>
                <li>Confirm the tube reaches the liquid.</li>
                <li>Place a spare glass under the nozzle.</li>
                <li>
                  Tap <strong>{newName} connected</strong> to start priming.
                </li>
              </ol>
            </div>
          )
        ))}

      {phase.kind === 'done' && (
        <div className="mx-auto flex max-w-xl flex-col items-center gap-6 py-8 text-center">
          <div className="rounded-full bg-primary/15 p-6 ring-1 ring-primary/30">
            <Droplets className="size-14 text-primary" />
          </div>
          <p className="text-2xl font-semibold">
            {assigning ? `Line ${pumpId} is ready` : `Line ${pumpId} is dry`}
          </p>
          <p className="text-lg leading-relaxed text-muted-foreground">
            {assigning && newName
              ? `${newName} is primed and ready to pour.`
              : `${oldName} was cleared out. Store the line dry until you assign a new liquid.`}
          </p>
        </div>
      )}
    </SetupWizardShell>
  );
}
