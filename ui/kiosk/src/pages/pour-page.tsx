import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Loader2, PartyPopper, Wine } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useRoute } from 'wouter';

import { LinkButton } from '@/components/kiosk/link-button';
import { KioskShell } from '@/components/kiosk/kiosk-shell';
import { ManualPourStepPanel } from '@/components/kiosk/manual-pour-step-panel';
import { PourProgressBar } from '@/components/kiosk/pour-progress-bar';
import { PourScreenShell } from '@/components/kiosk/pour-screen-shell';
import { Button } from '@/components/ui/button';
import { getRecipeById } from '@/data/load-recipes';
import { useDelayedTrue } from '@/hooks/use-delayed-true';
import { useLatestRef } from '@/hooks/use-latest-ref';
import { fetchDeviceStatus, useDeviceStatus } from '@/hooks/use-device-status';
import {
  useAcknowledgePrompt,
  useCancelPour,
  useStartPour,
} from '@/hooks/use-device-mutations';
import {
  buildPostPourSteps,
  buildPrePourSteps,
  postPourStepInstruction,
  prePourStepInstruction,
  prePourStepLabel,
} from '@/lib/manual-pour';
import {
  effectiveBlockingIssues,
  firstBlockingMessage,
  getDrinkAvailability,
} from '@/lib/availability';
import { deviceErrorMessage } from '@/lib/device-errors';
import { isActivePourJob, isTerminalPourJob } from '@/lib/pour-job';
import { shouldCancelPourOnLeave } from '@/lib/pour-leave';
import { pourStepsFromRecipe } from '@/lib/pour-steps';
import { consumePourInventoryBypass } from '@/lib/pour-inventory-bypass';
import { cn } from '@/lib/utils';

const WAIT_FOR_JOB_MS = 15000;
const RETURN_TO_MENU_MS = 3000;

export function PourPage() {
  const [, params] = useRoute('/pour/:id');
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const recipe = getRecipeById(params?.id ?? '');
  const recipeId = recipe?.id ?? '';
  const [bypassInventory] = useState(() =>
    recipeId ? consumePourInventoryBypass(recipeId) : false,
  );

  const preSteps = useMemo(
    () => (recipe ? buildPrePourSteps(recipe) : []),
    [recipe],
  );
  const postSteps = useMemo(
    () => (recipe ? buildPostPourSteps(recipe) : []),
    [recipe],
  );

  const { status, error: deviceError } = useDeviceStatus();
  const startPour = useStartPour();
  const cancelPour = useCancelPour();
  const acknowledgePrompt = useAcknowledgePrompt();
  const cancelPourRef = useLatestRef(cancelPour.mutateAsync);

  const [preStepIndex, setPreStepIndex] = useState(0);
  const [postStepIndex, setPostStepIndex] = useState(0);
  const [pourStarted, setPourStarted] = useState(false);
  const [startingPour, setStartingPour] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [flowComplete, setFlowComplete] = useState(false);

  const job = status?.job;
  const isThisRecipe = job?.recipeId === recipe?.id;
  const jobState = isThisRecipe ? job?.state : undefined;

  const prePourPhase = preStepIndex < preSteps.length;
  const postPourPhase =
    pourStarted &&
    !flowComplete &&
    postStepIndex < postSteps.length &&
    (jobState === 'prompt' || jobState === 'complete');

  const jobRef = useLatestRef(job);
  const recipeIdRef = useLatestRef(recipeId);
  const expectActivePourRef = useLatestRef(pourStarted && !prePourPhase);
  const pourPageActiveRef = useRef(false);
  const beginPourAttemptedRef = useRef(false);

  const foreignActivePour = Boolean(
    job && recipe && job.recipeId !== recipe.id && isActivePourJob(job),
  );
  const pumpBusy = status?.pumpJob?.state === 'running';
  const waitingForJob = Boolean(
    recipe &&
      status &&
      pourStarted &&
      !prePourPhase &&
      !postPourPhase &&
      !flowComplete &&
      !pumpBusy &&
      !foreignActivePour &&
      (!job ||
        (job.recipeId !== recipe.id && isTerminalPourJob(job)) ||
        (job.recipeId === recipe.id &&
          job.state !== 'pouring' &&
          job.state !== 'prompt' &&
          job.state !== 'complete')),
  );
  const waitTimedOut = useDelayedTrue(waitingForJob, WAIT_FOR_JOB_MS);

  const beginPour = useCallback(async () => {
    if (!recipe || !status?.connected || deviceError) {
      setStartError(deviceError ?? 'Device offline');
      return;
    }

    let latest;
    try {
      latest = await fetchDeviceStatus(queryClient);
    } catch {
      setStartError('Could not verify device status — try again.');
      return;
    }

    if (latest.job?.state === 'pouring' || latest.job?.state === 'prompt') {
      setStartError('Machine is busy — wait for the current pour to finish.');
      return;
    }

    if (latest.pumpJob?.state === 'running') {
      setStartError('Machine is busy in setup — finish setup before pouring.');
      return;
    }

    const availability = getDrinkAvailability(recipe, latest);
    if (
      effectiveBlockingIssues(availability.issues, bypassInventory).length > 0
    ) {
      setStartError(
        firstBlockingMessage(availability.issues, bypassInventory),
      );
      return;
    }

    if (beginPourAttemptedRef.current) return;
    beginPourAttemptedRef.current = true;

    setStartingPour(true);
    setStartError(null);
    try {
      await startPour.mutateAsync({
        recipeId: recipe.id,
        steps: pourStepsFromRecipe(recipe),
      });
      setPourStarted(true);
      await fetchDeviceStatus(queryClient);
    } catch (err) {
      setStartError(deviceErrorMessage(err));
      beginPourAttemptedRef.current = false;
    } finally {
      setStartingPour(false);
    }
  }, [
    recipe,
    status?.connected,
    deviceError,
    queryClient,
    bypassInventory,
    startPour,
  ]);

  useEffect(() => {
    if (prePourPhase || pourStarted || beginPourAttemptedRef.current) return;
    if (!recipe || !status) return;

    void beginPour();
  }, [prePourPhase, pourStarted, recipe, status, beginPour]);

  useEffect(() => {
    if (!postPourPhase && jobState === 'complete' && postSteps.length === 0) {
      setFlowComplete(true);
    }
  }, [postPourPhase, jobState, postSteps.length]);

  useEffect(() => {
    if (jobState !== 'prompt' || postSteps.length > 0 || flowComplete) return;
    void acknowledgePrompt
      .mutateAsync()
      .then(() => {
        setFlowComplete(true);
      })
      .catch((err: unknown) => {
        setActionError(deviceErrorMessage(err));
      });
  }, [jobState, postSteps.length, flowComplete, acknowledgePrompt]);

  useEffect(() => {
    pourPageActiveRef.current = true;
    return () => {
      pourPageActiveRef.current = false;
      queueMicrotask(() => {
        if (pourPageActiveRef.current) return;

        const active = jobRef.current;
        const forRecipeId = recipeIdRef.current;
        if (
          !shouldCancelPourOnLeave(active, forRecipeId, {
            expectActivePour: expectActivePourRef.current,
          })
        ) {
          return;
        }

        void cancelPourRef.current().catch((err: unknown) => {
          console.error('Pour cancel on leave failed', err);
        });
      });
    };
  }, [cancelPourRef, expectActivePourRef, jobRef, recipeIdRef]);

  useEffect(() => {
    if (!recipe || !flowComplete) return;

    const timer = window.setTimeout(() => { navigate('/'); }, RETURN_TO_MENU_MS);
    return () => { window.clearTimeout(timer); };
  }, [recipe, flowComplete, navigate]);

  if (!recipe) {
    return (
      <KioskShell className="flex items-center justify-center">
        <LinkButton href="/" className="kiosk-cta">
          Back
        </LinkButton>
      </KioskShell>
    );
  }

  const handlePreStepDone = () => {
    setActionError(null);
    setPreStepIndex((index) => index + 1);
  };

  const handlePostStepDone = async () => {
    setActionError(null);
    const nextIndex = postStepIndex + 1;
    if (nextIndex < postSteps.length) {
      setPostStepIndex(nextIndex);
      return;
    }

    try {
      if (job?.state === 'prompt') {
        await acknowledgePrompt.mutateAsync();
      }
      setFlowComplete(true);
    } catch (err) {
      setActionError(deviceErrorMessage(err));
    }
  };

  const handleCancel = async () => {
    setActionError(null);
    try {
      await cancelPour.mutateAsync();
      navigate(`/drink/${recipe.id}`);
    } catch (err) {
      setActionError(deviceErrorMessage(err));
    }
  };

  if (prePourPhase) {
    const step = preSteps[preStepIndex];
    return (
      <ManualPourStepPanel
        recipe={recipe}
        stepLabel={prePourStepLabel(step)}
        instruction={prePourStepInstruction(step)}
        icon={step.kind === 'ice' ? 'ice' : 'hand'}
        onConfirm={handlePreStepDone}
        onCancel={() => { navigate(`/drink/${recipe.id}`); }}
      />
    );
  }

  if (startingPour || (startError && !pourStarted)) {
    return (
      <PourScreenShell
        recipeId={recipeId}
        category={recipe.categories[0]}
        className="text-center"
      >
        {startingPour ? (
          <Loader2 className="size-12 animate-spin text-primary" />
        ) : null}
        <h1 className="font-heading text-3xl font-semibold">{recipe.name}</h1>
        <p className="text-lg text-muted-foreground">
          {startError ??
            (startingPour ? 'Starting pour…' : 'Preparing to pour…')}
        </p>
        {startError && (
          <LinkButton
            href={`/drink/${recipe.id}`}
            variant="outline"
            className="kiosk-touch"
          >
            Back
          </LinkButton>
        )}
      </PourScreenShell>
    );
  }

  if (postPourPhase) {
    const ingredient = postSteps[postStepIndex];
    return (
      <ManualPourStepPanel
        recipe={recipe}
        stepLabel={ingredient.name}
        instruction={postPourStepInstruction(ingredient)}
        actionError={actionError}
        onConfirm={() => void handlePostStepDone()}
      />
    );
  }

  if (flowComplete || (jobState === 'complete' && postSteps.length === 0)) {
    return (
      <PourScreenShell
        recipeId={recipeId}
        category={recipe.categories[0]}
        contentClassName="relative flex min-h-dvh flex-col items-center justify-center gap-10 p-8"
        className="text-center"
      >
        <div className="rounded-full bg-emerald-500/15 p-6 ring-1 ring-emerald-500/30">
          <PartyPopper className="size-14 text-emerald-300" />
        </div>
        <h1 className="font-heading text-4xl font-bold">
          Enjoy your {recipe.name}
        </h1>
        <PourProgressBar value={100} />
        <p className="text-lg text-muted-foreground">Returning to menu…</p>
      </PourScreenShell>
    );
  }

  if (!status || pumpBusy || foreignActivePour || !job || !isThisRecipe) {
    const busyMessage = pumpBusy
      ? 'Machine is busy in setup — finish setup before pouring.'
      : foreignActivePour
        ? 'Machine is pouring another drink — wait or cancel it first.'
        : null;

    return (
      <PourScreenShell
        recipeId={recipeId}
        category={recipe.categories[0]}
        className="text-center"
      >
        <Loader2 className="size-12 animate-spin text-primary" />
        <h1 className="font-heading text-3xl font-semibold">{recipe.name}</h1>
        <p className="text-lg text-muted-foreground">
          {busyMessage ??
            (waitTimedOut
              ? 'Pour did not start. Check the machine or try again from the drink screen.'
              : 'Waiting for pour to start…')}
        </p>
        <LinkButton
          href={`/drink/${recipe.id}`}
          variant="outline"
          className="kiosk-touch"
        >
          Back
        </LinkButton>
      </PourScreenShell>
    );
  }

  if (job.state === 'cancelled') {
    return (
      <PourScreenShell recipeId={recipeId} category={recipe.categories[0]}>
        <CheckCircle2 className="size-12 text-muted-foreground" />
        <p className="text-xl text-muted-foreground">Pour cancelled.</p>
        <LinkButton
          href={`/drink/${recipe.id}`}
          size="lg"
          className="kiosk-cta"
        >
          Back to drink
        </LinkButton>
      </PourScreenShell>
    );
  }

  if (job.state === 'prompt') {
    return (
      <PourScreenShell
        recipeId={recipeId}
        category={recipe.categories[0]}
        className="text-center"
      >
        {actionError ? (
          <>
            <p className="text-lg text-destructive">{actionError}</p>
            <Button
              size="lg"
              className="kiosk-touch"
              onClick={() => {
                setActionError(null);
                void acknowledgePrompt
                  .mutateAsync()
                  .then(() => {
                    setFlowComplete(true);
                  })
                  .catch((err: unknown) => {
                    setActionError(deviceErrorMessage(err));
                  });
              }}
            >
              Retry
            </Button>
          </>
        ) : (
          <>
            <Loader2 className="size-12 animate-spin text-primary" />
            <p className="text-lg text-muted-foreground">Finishing up…</p>
          </>
        )}
      </PourScreenShell>
    );
  }

  return (
    <PourScreenShell
      recipeId={recipeId}
      category={recipe.categories[0]}
      contentClassName="relative flex min-h-dvh flex-col items-center justify-center gap-10 p-8"
    >
      <div className="relative">
        <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
        <div className="relative rounded-full bg-primary/15 p-8 ring-1 ring-primary/30">
          <Wine className="size-16 text-primary" />
        </div>
      </div>

      <div className="text-center" aria-live="polite">
        <h1 className="font-heading text-4xl font-bold">{recipe.name}</h1>
        <p className="mt-2 text-xl text-muted-foreground">{job.stepLabel}</p>
      </div>

      <PourProgressBar value={job.progress} />

      {actionError && (
        <p className="text-sm text-destructive">{actionError}</p>
      )}

      <Button
        variant="destructive"
        size="lg"
        className={cn('kiosk-touch min-w-36 text-base')}
        onClick={() => void handleCancel()}
      >
        Cancel
      </Button>
    </PourScreenShell>
  );
}
