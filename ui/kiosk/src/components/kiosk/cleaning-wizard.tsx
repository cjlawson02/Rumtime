import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';

import {
  getPumpDispenseViewState,
  PumpDispenseStatus,
} from '@/components/kiosk/pump-dispense-panel';
import {
  SetupWizardShell,
  WizardFooterActions,
} from '@/components/kiosk/setup-wizard-shell';
import { WizardErrorBanner } from '@/components/kiosk/wizard-error-banner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useDeviceStatus } from '@/hooks/use-device-status';
import {
  useUpdatePrimed,
  useUpdatePumpBinding,
} from '@/hooks/use-device-mutations';
import { usePumpDispenseSession } from '@/hooks/use-pump-dispense-session';
import {
  cleaningPurposeLabel,
  MAX_CLEANING_RUN_SECONDS,
  needsExtraFlush,
  nextLineCleaningStatus,
  SANITIZER_CONTACT_SECONDS,
  TIMED_FLUSH_SECONDS,
  type CleaningPurpose,
  type LineCleaningStatus,
} from '@/lib/cleaning';
import { deviceErrorMessage } from '@/lib/device-errors';
import {
  resetPumpPourTracker,
  resolvePumpPourOutcome,
  type PumpPourTracker,
} from '@/lib/pump-pour-lifecycle';

type Phase =
  | { kind: 'prepare' }
  | { kind: 'flush-intro' }
  | { kind: 'flush-run'; lineIndex: number; awaitingExtraFlush?: boolean }
  | { kind: 'sanitize-intro' }
  | { kind: 'sanitize-run'; lineIndex: number }
  | { kind: 'contact'; remainingSeconds: number }
  | { kind: 'drain-run'; lineIndex: number }
  | { kind: 'finish' };

type CleaningWizardProps = {
  open: boolean;
  pumpIds: number[];
  mode: 'session' | 'line';
  onOpenChange: (open: boolean) => void;
  onComplete?: (updates: Record<number, LineCleaningStatus>) => void;
  ingredientName: (ingredientId: string) => string;
};

function phaseStepTitle(phase: Phase, lineCount: number): string {
  switch (phase.kind) {
    case 'prepare':
      return 'Get ready to clean';
    case 'flush-intro':
      return 'Warm-water flush';
    case 'flush-run':
      return lineCount > 1
        ? `Flush line ${phase.lineIndex + 1} of ${lineCount}`
        : 'Flush until the line runs clear';
    case 'sanitize-intro':
      return 'Move tubes to sanitizer';
    case 'sanitize-run':
      return lineCount > 1
        ? `Sanitize line ${phase.lineIndex + 1} of ${lineCount}`
        : 'Run sanitizer to the nozzle';
    case 'contact':
      return 'Sanitizer contact time';
    case 'drain-run':
      return lineCount > 1
        ? `Drain line ${phase.lineIndex + 1} of ${lineCount}`
        : 'Drain into waste';
    case 'finish':
      return 'Lines cleaned';
  }
}

function countSteps(lineCount: number): number {
  if (lineCount === 0) return 1;
  return 4 + lineCount * 3;
}

function phaseToStepIndex(phase: Phase, lineCount: number): number {
  switch (phase.kind) {
    case 'prepare':
      return 0;
    case 'flush-intro':
      return 1;
    case 'flush-run':
      return 2 + phase.lineIndex;
    case 'sanitize-intro':
      return 2 + lineCount;
    case 'sanitize-run':
      return 3 + lineCount + phase.lineIndex;
    case 'contact':
      return 3 + lineCount * 2;
    case 'drain-run':
      return 4 + lineCount * 2 + phase.lineIndex;
    case 'finish':
      return countSteps(lineCount) - 1;
  }
}

function advancePhase(phase: Phase, lineCount: number): Phase {
  switch (phase.kind) {
    case 'prepare':
      return { kind: 'flush-intro' };
    case 'flush-intro':
      return { kind: 'flush-run', lineIndex: 0 };
    case 'flush-run':
      if (phase.lineIndex + 1 < lineCount) {
        return { kind: 'flush-run', lineIndex: phase.lineIndex + 1 };
      }
      return { kind: 'sanitize-intro' };
    case 'sanitize-intro':
      return { kind: 'sanitize-run', lineIndex: 0 };
    case 'sanitize-run':
      if (phase.lineIndex + 1 < lineCount) {
        return { kind: 'sanitize-run', lineIndex: phase.lineIndex + 1 };
      }
      return {
        kind: 'contact',
        remainingSeconds: SANITIZER_CONTACT_SECONDS,
      };
    case 'contact':
      return { kind: 'drain-run', lineIndex: 0 };
    case 'drain-run':
      if (phase.lineIndex + 1 < lineCount) {
        return { kind: 'drain-run', lineIndex: phase.lineIndex + 1 };
      }
      return { kind: 'finish' };
    case 'finish':
      return phase;
  }
}

function retreatPhase(phase: Phase, lineCount: number): Phase | null {
  switch (phase.kind) {
    case 'prepare':
      return null;
    case 'flush-intro':
      return { kind: 'prepare' };
    case 'flush-run':
      if (phase.lineIndex > 0) {
        return { kind: 'flush-run', lineIndex: phase.lineIndex - 1 };
      }
      return { kind: 'flush-intro' };
    case 'sanitize-intro':
      return lineCount > 0
        ? { kind: 'flush-run', lineIndex: lineCount - 1 }
        : { kind: 'flush-intro' };
    case 'sanitize-run':
      if (phase.lineIndex > 0) {
        return { kind: 'sanitize-run', lineIndex: phase.lineIndex - 1 };
      }
      return { kind: 'sanitize-intro' };
    case 'contact':
      return lineCount > 0
        ? { kind: 'sanitize-run', lineIndex: lineCount - 1 }
        : { kind: 'sanitize-intro' };
    case 'drain-run':
      if (phase.lineIndex > 0) {
        return { kind: 'drain-run', lineIndex: phase.lineIndex - 1 };
      }
      return {
        kind: 'contact',
        remainingSeconds: SANITIZER_CONTACT_SECONDS,
      };
    case 'finish':
      return lineCount > 0
        ? { kind: 'drain-run', lineIndex: lineCount - 1 }
        : { kind: 'contact', remainingSeconds: SANITIZER_CONTACT_SECONDS };
  }
}

export function CleaningWizard(props: CleaningWizardProps) {
  if (!props.open) return null;
  return <CleaningWizardSession {...props} />;
}

function CleaningWizardSession({
  pumpIds,
  mode,
  onOpenChange,
  onComplete,
  ingredientName,
}: CleaningWizardProps) {
  const { status } = useDeviceStatus();
  const updatePrimed = useUpdatePrimed();
  const updatePumpBinding = useUpdatePumpBinding();
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
  const [phase, setPhase] = useState<Phase>({ kind: 'prepare' });
  const [extraFlushReady, setExtraFlushReady] = useState(false);
  const completingRef = useRef(false);
  const contactTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runPourRef = useRef<PumpPourTracker>(createTracker());
  const timedFlushPourRef = useRef<PumpPourTracker>(createTracker());

  const selectedPumps = useMemo(() => {
    if (!status?.pumps?.length) return [];
    const idSet = new Set(pumpIds);
    return [...status.pumps]
      .filter((pump) => idSet.has(pump.pumpId))
      .sort((a, b) => a.pumpId - b.pumpId);
  }, [status, pumpIds]);

  const lineCount = selectedPumps.length;
  const cleanedHadAssignments = useMemo(
    () => selectedPumps.some((pump) => pump.ingredientId),
    [selectedPumps],
  );
  const currentPump =
    phase.kind === 'flush-run' ||
    phase.kind === 'sanitize-run' ||
    phase.kind === 'drain-run'
      ? selectedPumps[phase.lineIndex]
      : undefined;

  const currentPurpose: CleaningPurpose | null =
    phase.kind === 'flush-run'
      ? 'flush'
      : phase.kind === 'sanitize-run'
        ? 'sanitize'
        : phase.kind === 'drain-run'
          ? 'drain'
          : null;

  const dispense = getPumpDispenseViewState(
    currentPump?.pumpId ?? -1,
    status?.pumpJob,
  );

  const resetWizard = useCallback(() => {
    resetPumpPourTracker(runPourRef.current);
    resetPumpPourTracker(timedFlushPourRef.current);
    setPhase({ kind: 'prepare' });
    setError(null);
    setExtraFlushReady(false);
    completingRef.current = false;
    if (contactTimerRef.current) {
      clearInterval(contactTimerRef.current);
      contactTimerRef.current = null;
    }
  }, [setError]);

  const closeWizard = useCallback(() => {
    closeDispenseSession(onOpenChange, resetWizard);
  }, [closeDispenseSession, onOpenChange, resetWizard]);

  useEffect(() => {
    if (phase.kind !== 'contact') {
      if (contactTimerRef.current) {
        clearInterval(contactTimerRef.current);
        contactTimerRef.current = null;
      }
      return;
    }

    if (contactTimerRef.current) return;

    contactTimerRef.current = setInterval(() => {
      setPhase((current) => {
        if (current.kind !== 'contact') return current;
        if (current.remainingSeconds <= 1) {
          if (contactTimerRef.current) {
            clearInterval(contactTimerRef.current);
            contactTimerRef.current = null;
          }
          return { ...current, remainingSeconds: 0 };
        }
        return {
          ...current,
          remainingSeconds: current.remainingSeconds - 1,
        };
      });
    }, 1000);

    return () => {
      if (contactTimerRef.current) {
        clearInterval(contactTimerRef.current);
        contactTimerRef.current = null;
      }
    };
  }, [phase.kind]);

  useEffect(() => {
    if (completingRef.current || !currentPump) return;

    if (currentPurpose) {
      const outcome = resolvePumpPourOutcome(
        runPourRef.current,
        currentPump.pumpId,
        currentPurpose,
        status?.pumpJob,
      );
      if (outcome === 'cancelled') {
        resetPumpPourTracker(runPourRef.current);
        setError(
          `${cleaningPurposeLabel(currentPurpose).replace('…', '')} stopped — check the line or try again (max ${MAX_CLEANING_RUN_SECONDS}s).`,
        );
      }
    }

    if (phase.kind === 'flush-run' && phase.awaitingExtraFlush) {
      const outcome = resolvePumpPourOutcome(
        timedFlushPourRef.current,
        currentPump.pumpId,
        'flush',
        status?.pumpJob,
      );
      if (outcome === 'cancelled') {
        resetPumpPourTracker(timedFlushPourRef.current);
        setError(
          `Extra flush stopped — check the line or try again (max ${MAX_CLEANING_RUN_SECONDS}s).`,
        );
      }
      if (outcome === 'finished') {
        setExtraFlushReady(true);
      }
    }
  }, [currentPump, currentPurpose, phase, status?.pumpJob]);

  const startContinuousRun = (purpose: CleaningPurpose) => {
    if (!currentPump) return;
    void startRun({
      pumpId: currentPump.pumpId,
      purpose,
      tracker: runPourRef,
    });
  };

  const startTimedExtraFlush = () => {
    if (!currentPump) return;
    setExtraFlushReady(false);
    void startRun({
      pumpId: currentPump.pumpId,
      purpose: 'flush',
      durationSeconds: TIMED_FLUSH_SECONDS,
      tracker: timedFlushPourRef,
    });
  };

  const stopRun = async () => {
    completingRef.current = true;
    try {
      await stopDispenseRun({ tracker: runPourRef });
    } finally {
      completingRef.current = false;
    }
  };

  const handleEmergencyStop = () => {
    if (!currentPump) return;
    void emergencyStop(currentPump.pumpId, () => {
      if (phase.kind === 'flush-run' && phase.awaitingExtraFlush) {
        timedFlushPourRef.current.cancelRequested = true;
      } else if (currentPurpose) {
        runPourRef.current.cancelRequested = true;
      }
    });
  };

  const resetCleanedLines = async () => {
    for (const pump of selectedPumps) {
      if (!pump.ingredientId) continue;
      await updatePrimed.mutateAsync({
        ingredientId: pump.ingredientId,
        primed: false,
      });
      await updatePumpBinding.mutateAsync({
        pumpId: pump.pumpId,
        ingredientId: null,
      });
    }
  };

  const finishWizard = async () => {
    setError(null);
    try {
      await resetCleanedLines();
      const updates: Record<number, LineCleaningStatus> = {};
      for (const pump of selectedPumps) {
        updates[pump.pumpId] = 'done';
      }
      onComplete?.(updates);
      closeWizard();
    } catch (err) {
      setError(deviceErrorMessage(err));
    }
  };

  const recordPartialProgress = (step: 'flush' | 'sanitize' | 'drain') => {
    if (!currentPump) return;
    const updates: Record<number, LineCleaningStatus> = {
      [currentPump.pumpId]: nextLineCleaningStatus('idle', step),
    };
    onComplete?.(updates);
  };

  const stepIndex = phaseToStepIndex(phase, lineCount);
  const stepCount = Math.max(1, countSteps(lineCount));
  const stepTitle = phaseStepTitle(phase, lineCount);
  const wizardTitle =
    mode === 'session'
      ? 'Session line clean'
      : pumpIds.length === 1
        ? `Clean line ${pumpIds[0]}`
        : currentPump
          ? `Clean line ${currentPump.pumpId}`
          : 'Line cleaning';

  const footer = (() => {
    if (lineCount === 0) {
      return (
        <WizardFooterActions
          showBack={false}
          onNext={closeWizard}
          nextLabel="Close"
        />
      );
    }

    if (phase.kind === 'prepare') {
      return (
        <WizardFooterActions
          showBack={false}
          onNext={() => { setPhase(advancePhase(phase, lineCount)); }}
          nextLabel="Start cleaning"
        />
      );
    }

    if (phase.kind === 'flush-intro' || phase.kind === 'sanitize-intro') {
      return (
        <WizardFooterActions
          onBack={() => {
            const prev = retreatPhase(phase, lineCount);
            if (prev) setPhase(prev);
          }}
          onNext={() => { setPhase(advancePhase(phase, lineCount)); }}
          nextLabel="Continue"
        />
      );
    }

    if (phase.kind === 'flush-run') {
      const ingredientId = currentPump?.ingredientId;
      const wantsExtraFlush = Boolean(
        ingredientId && needsExtraFlush(ingredientId),
      );

      if (dispense?.active) {
        return (
          <WizardFooterActions
            backLabel="Emergency stop"
            backVariant="destructive"
            onBack={() => { handleEmergencyStop(); }}
            onNext={() => {
              void (async () => {
                await stopRun();
                if (phase.awaitingExtraFlush) {
                  return;
                }
                recordPartialProgress('flush');
                if (wantsExtraFlush) {
                  setPhase({ ...phase, awaitingExtraFlush: true });
                  return;
                }
                setPhase(advancePhase(phase, lineCount));
              })();
            }}
            nextLabel={
              phase.awaitingExtraFlush
                ? 'Extra flush complete'
                : 'Line runs clear'
            }
          />
        );
      }

      if (phase.awaitingExtraFlush) {
        if (extraFlushReady) {
          return (
            <WizardFooterActions
              showBack={false}
              onNext={() => {
                resetPumpPourTracker(timedFlushPourRef.current);
                setExtraFlushReady(false);
                setPhase(advancePhase(phase, lineCount));
              }}
              nextLabel="Continue"
            />
          );
        }

        return (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {ingredientId
                ? `${ingredientName(ingredientId)} is sticky — run an extra ${TIMED_FLUSH_SECONDS}s warm-water flush, or skip if the line already looks clear.`
                : null}
            </p>
            <WizardFooterActions
              onBack={() =>
                { setPhase({
                  kind: 'flush-run',
                  lineIndex: phase.lineIndex,
                }); }
              }
              backLabel="Flush again"
              onNext={() => { startTimedExtraFlush(); }}
              nextLabel={
                starting
                  ? 'Starting…'
                  : `Run ${TIMED_FLUSH_SECONDS}s extra flush`
              }
              nextDisabled={starting}
            />
            <Button
              type="button"
              variant="ghost"
              className="kiosk-touch self-end"
              onClick={() => { setPhase(advancePhase(phase, lineCount)); }}
            >
              Skip extra flush
            </Button>
          </div>
        );
      }

      return (
        <WizardFooterActions
          onBack={() => {
            const prev = retreatPhase(phase, lineCount);
            if (prev) setPhase(prev);
          }}
          onNext={() => { startContinuousRun('flush'); }}
          nextLabel={starting ? 'Starting…' : 'Start flush'}
          nextDisabled={starting}
        />
      );
    }

    if (phase.kind === 'sanitize-run') {
      if (dispense?.active) {
        return (
          <WizardFooterActions
            backLabel="Emergency stop"
            backVariant="destructive"
            onBack={() => { handleEmergencyStop(); }}
            onNext={() => {
              void (async () => {
                await stopRun();
                recordPartialProgress('sanitize');
                setPhase(advancePhase(phase, lineCount));
              })();
            }}
            nextLabel="Sanitizer at nozzle"
          />
        );
      }

      return (
        <WizardFooterActions
          onBack={() => {
            const prev = retreatPhase(phase, lineCount);
            if (prev) setPhase(prev);
          }}
          onNext={() => { startContinuousRun('sanitize'); }}
          nextLabel={starting ? 'Starting…' : 'Start sanitizer run'}
          nextDisabled={starting}
        />
      );
    }

    if (phase.kind === 'contact') {
      return (
        <WizardFooterActions
          onBack={() => {
            const prev = retreatPhase(phase, lineCount);
            if (prev) setPhase(prev);
          }}
          onNext={() => { setPhase(advancePhase(phase, lineCount)); }}
          nextLabel={
            phase.remainingSeconds > 0
              ? `${phase.remainingSeconds}s remaining`
              : 'Continue to drain'
          }
          nextDisabled={phase.remainingSeconds > 0}
        />
      );
    }

    if (phase.kind === 'drain-run') {
      if (dispense?.active) {
        return (
          <WizardFooterActions
            backLabel="Emergency stop"
            backVariant="destructive"
            onBack={() => { handleEmergencyStop(); }}
            onNext={() => {
              void (async () => {
                await stopRun();
                recordPartialProgress('drain');
                setPhase(advancePhase(phase, lineCount));
              })();
            }}
            nextLabel="Line drained"
          />
        );
      }

      return (
        <WizardFooterActions
          onBack={() => {
            const prev = retreatPhase(phase, lineCount);
            if (prev) setPhase(prev);
          }}
          onNext={() => { startContinuousRun('drain'); }}
          nextLabel={starting ? 'Starting…' : 'Start drain'}
          nextDisabled={starting}
        />
      );
    }

    return (
      <WizardFooterActions
        showBack={false}
        onNext={() => void finishWizard()}
        nextLabel="Done"
      />
    );
  })();

  return (
    <SetupWizardShell
      open
      title={wizardTitle}
      stepIndex={stepIndex}
      stepCount={stepCount}
      stepTitle={stepTitle}
      onCancel={closeWizard}
      footer={footer}
    >
      <WizardErrorBanner error={error} />

      {lineCount === 0 && (
        <p className="mx-auto max-w-xl text-lg text-muted-foreground">
          No lines selected for cleaning.
        </p>
      )}

      {phase.kind === 'prepare' && lineCount > 0 && (
        <div className="mx-auto max-w-xl space-y-4 text-lg leading-relaxed text-muted-foreground">
          <p>
            {mode === 'session'
              ? `Clean ${lineCount} line${lineCount === 1 ? '' : 's'} after service.`
              : 'Run the full flush, sanitize, and drain cycle for this line.'}
          </p>
          <ol className="list-decimal space-y-3 pl-6">
            <li>Remove pickup tubes from ingredient bottles.</li>
            <li>
              Place tubes in a jug of <strong>warm water</strong> (or use your
              cleaning dock).
            </li>
            <li>
              Empty the drip tray and have a waste cup ready under the nozzle.
            </li>
            <li>
              Inventory is <strong>not</strong> deducted during cleaning runs.
            </li>
          </ol>
        </div>
      )}

      {phase.kind === 'flush-intro' && (
        <div className="mx-auto max-w-xl space-y-4 text-lg leading-relaxed text-muted-foreground">
          <p>
            With pickup tubes in warm water, flush each line forward until the
            outlet runs clear — no color or syrup left.
          </p>
          <p>
            Sticky lines (simple syrup, grenadine, liqueurs) get an optional
            extra {TIMED_FLUSH_SECONDS}s flush.
          </p>
        </div>
      )}

      {phase.kind === 'flush-run' && currentPump && (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Line {currentPump.pumpId}</Badge>
            <span className="text-lg text-muted-foreground">
              {currentPump.ingredientId
                ? ingredientName(currentPump.ingredientId)
                : 'Unassigned'}
            </span>
          </div>
          <PumpDispenseStatus
            pumpId={currentPump.pumpId}
            pumpJob={status?.pumpJob}
            continuous={!phase.awaitingExtraFlush || dispense?.isContinuous}
            continuousHint="stop when the line runs clear"
            idleDescription={
              phase.awaitingExtraFlush
                ? `Run an extra ${TIMED_FLUSH_SECONDS}s warm-water flush for this sticky line, or skip if it already looks clear.`
                : 'Pump warm water through the line into waste. Stop when the outlet runs clear.'
            }
          />
        </>
      )}

      {phase.kind === 'sanitize-intro' && (
        <div className="mx-auto max-w-xl space-y-4 text-lg leading-relaxed text-muted-foreground">
          <p>
            Move pickup tubes to freshly mixed sanitizer (Star San or per
            label).
          </p>
          <ol className="list-decimal space-y-3 pl-6">
            <li>Follow the sanitizer label for dilution and contact time.</li>
            <li>Do not send flush water or sanitizer back into bottles.</li>
            <li>
              Run each line until sanitizer reaches the nozzle — then wait{' '}
              {SANITIZER_CONTACT_SECONDS}s before draining.
            </li>
          </ol>
        </div>
      )}

      {phase.kind === 'sanitize-run' && currentPump && (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Line {currentPump.pumpId}</Badge>
            <span className="text-lg text-muted-foreground">
              {currentPump.ingredientId
                ? ingredientName(currentPump.ingredientId)
                : 'Unassigned'}
            </span>
          </div>
          <PumpDispenseStatus
            pumpId={currentPump.pumpId}
            pumpJob={status?.pumpJob}
            continuous
            idleDescription="Run sanitizer forward into waste until it reaches the nozzle tip."
          />
        </>
      )}

      {phase.kind === 'contact' && (
        <div className="mx-auto flex max-w-xl flex-col items-center gap-6 py-12 text-center">
          <p className="text-6xl font-semibold tabular-nums">
            {phase.remainingSeconds}s
          </p>
          <p className="text-lg leading-relaxed text-muted-foreground">
            Let sanitizer dwell on all lines. Follow your label if it requires
            longer contact time.
          </p>
          {phase.remainingSeconds > 0 ? (
            <Button
              type="button"
              variant="outline"
              className="kiosk-touch"
              onClick={() => { setPhase({ kind: 'contact', remainingSeconds: 0 }); }}
            >
              Skip wait
            </Button>
          ) : null}
        </div>
      )}

      {phase.kind === 'drain-run' && currentPump && (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Line {currentPump.pumpId}</Badge>
            <span className="text-lg text-muted-foreground">
              {currentPump.ingredientId
                ? ingredientName(currentPump.ingredientId)
                : 'Unassigned'}
            </span>
          </div>
          <PumpDispenseStatus
            pumpId={currentPump.pumpId}
            pumpJob={status?.pumpJob}
            continuous
            continuousHint="stop when only air comes out"
            idleDescription="Drain or purge sanitizer into waste. Leave the line dry or mostly empty."
          />
        </>
      )}

      {phase.kind === 'finish' && (
        <div className="mx-auto flex max-w-xl flex-col items-center gap-6 py-8 text-center">
          <div className="rounded-full bg-primary/15 p-6 ring-1 ring-primary/30">
            <Sparkles className="size-14 text-primary" />
          </div>
          <p className="text-2xl font-semibold">Cleaning cycle complete</p>
          <p className="text-lg leading-relaxed text-muted-foreground">
            {cleanedHadAssignments ? (
              <>
                Lines are <strong>unassigned</strong> and marked{' '}
                <strong>needs prime</strong>. Wipe nozzle tips, wash the drip
                tray, and reconnect bottles in bottle bay before the next
                session.
              </>
            ) : (
              <>
                Lines are clean. Wipe nozzle tips, wash the drip tray, and
                assign bottles in bottle bay before the next session.
              </>
            )}
          </p>
        </div>
      )}
    </SetupWizardShell>
  );
}
