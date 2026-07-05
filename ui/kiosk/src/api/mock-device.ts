import type { DeviceClient } from '@/api/device-client';
import type {
  BottleSizeCommand,
  DeviceNotification,
  DeviceStatus,
  InventoryLevelCommand,
  PourCommand,
  PourJob,
  PourStep,
  PrimedCommand,
  PumpBindingCommand,
  PumpCalibrationCommand,
  PumpDispenseCommand,
  PumpJob,
  PumpSlot,
  RefillCommand,
} from '@/api/types';
import {
  DEFAULT_ANTI_DRIP_MS,
  DEFAULT_ML_PER_SECOND,
  deviceStatusSchema,
} from '@/api/types';
import { getRecipeById } from '@/data/load-recipes';
import { POST_POUR_MANUAL_IDS } from '@/lib/manual-pour';
import { resolvePumpCalibration, MAX_PRIME_SECONDS } from '@/lib/calibration';
import {
  cleaningPurposeLabel,
  isCleaningPurpose,
  isContinuousDispensePurpose,
  MAX_CLEANING_RUN_SECONDS,
  skipsInventoryDeduction,
} from '@/lib/cleaning';

/** JSON clone — validates against device schema after clone. */
function cloneStatus(status: DeviceStatus): DeviceStatus {
  const cloned = JSON.parse(JSON.stringify(status)) as DeviceStatus;
  return deviceStatusSchema.parse(cloned);
}

function cloneBindings(
  bindings: DeviceStatus['bindings'],
): DeviceStatus['bindings'] {
  return JSON.parse(JSON.stringify(bindings)) as DeviceStatus['bindings'];
}

const DEFAULT_BOTTLE_ML = 750;
const MOCK_PUMP_COUNT = 8;

const INITIAL_BINDINGS: DeviceStatus['bindings'] = {
  bourbon: {
    ingredientId: 'bourbon',
    remainingMl: 420,
    bottleSizeMl: 750,
    primed: true,
  },
  simple: {
    ingredientId: 'simple',
    remainingMl: 180,
    bottleSizeMl: 750,
    primed: true,
  },
  tequila: {
    ingredientId: 'tequila',
    remainingMl: 500,
    bottleSizeMl: 750,
    primed: true,
  },
  triple_sec: {
    ingredientId: 'triple_sec',
    remainingMl: 35,
    bottleSizeMl: 750,
    primed: true,
  },
  vodka: {
    ingredientId: 'vodka',
    remainingMl: 600,
    bottleSizeMl: 750,
    primed: true,
  },
  gin: {
    ingredientId: 'gin',
    remainingMl: 400,
    bottleSizeMl: 750,
    primed: true,
  },
  rum: {
    ingredientId: 'rum',
    remainingMl: 12,
    bottleSizeMl: 750,
    primed: true,
  },
  blue_curacao: {
    ingredientId: 'blue_curacao',
    remainingMl: 500,
    bottleSizeMl: 750,
    primed: true,
  },
};

/** Example firmware alerts — see docs/18-kiosk-device-api.md `notifications[]`. */
const INITIAL_NOTIFICATIONS: DeviceNotification[] = [
  {
    id: 'scale_not_ready',
    severity: 'warning',
    title: 'Scale not ready',
    message: 'Place an empty glass on the platform before pouring.',
  },
  {
    id: 'flow_timeout',
    severity: 'warning',
    title: 'No flow detected',
    message:
      'The last pour timed out waiting for liquid. Check that the line is primed and the bottle has liquid.',
    actionHref: '/setup/calibration',
    actionLabel: 'Pour tuning',
  },
];

function buildInitialPumps(): PumpSlot[] {
  const ingredientIds = Object.keys(INITIAL_BINDINGS);

  return Array.from({ length: MOCK_PUMP_COUNT }, (_, index) => ({
    pumpId: index + 1,
    ingredientId: ingredientIds[index] ?? null,
    mlPerSecond: DEFAULT_ML_PER_SECOND,
    antiDripMs: DEFAULT_ANTI_DRIP_MS,
  }));
}

type MockState = {
  status: DeviceStatus;
  pourTimer: ReturnType<typeof setInterval> | null;
  pumpTimer: ReturnType<typeof setInterval> | null;
};

const state: MockState = {
  status: {
    connected: true,
    firmwareVersion: 'mock-0.1.0',
    hostname: 'rumtime.local',
    bindings: cloneBindings(INITIAL_BINDINGS),
    pumps: buildInitialPumps(),
    notifications: [...INITIAL_NOTIFICATIONS],
    job: null,
    pumpJob: null,
  },
  pourTimer: null,
  pumpTimer: null,
};

function clearPourTimer() {
  if (state.pourTimer) {
    clearInterval(state.pourTimer);
    state.pourTimer = null;
  }
}

function clearPumpTimer() {
  if (state.pumpTimer) {
    clearInterval(state.pumpTimer);
    state.pumpTimer = null;
  }
}

function clearAllTimers() {
  clearPourTimer();
  clearPumpTimer();
}

/** Manual top-offs that get a post-pour prompt (carbonated mixers in v1). */
function manualPromptForRecipe(recipeId: string): string | undefined {
  const recipe = getRecipeById(recipeId);
  if (!recipe) return undefined;

  const postPour = recipe.ingredients.filter(
    (i) => i.kind === 'manual' && POST_POUR_MANUAL_IDS.has(i.id),
  );
  if (postPour.length === 0) return undefined;

  const names = postPour.map((i) => i.name).join(', ');
  return `Top with ${names}, then tap Done.`;
}

function subtractInventory(steps: PourStep[]) {
  for (const step of steps) {
    subtractIngredientMl(step.ingredientId, step.ml);
  }
}

function setJob(job: PourJob | null) {
  state.status.job = job;
}

function setPumpJob(job: PumpJob | null) {
  state.status.pumpJob = job;
}

function clearPumpJob() {
  setPumpJob(null);
}

function subtractIngredientMl(ingredientId: string, ml: number) {
  if (!(ingredientId in state.status.bindings)) return;
  const binding = state.status.bindings[ingredientId];
  binding.remainingMl = Math.max(0, binding.remainingMl - ml);
}

function finishTimedPumpJob(
  pump: PumpSlot,
  command: PumpDispenseCommand,
  volumeMl: number,
) {
  if (
    !skipsInventoryDeduction(command.purpose) &&
    pump.ingredientId &&
    volumeMl > 0
  ) {
    subtractIngredientMl(pump.ingredientId, volumeMl);
  }
  clearPumpJob();
}

function dispenseDurationMs(
  pump: PumpSlot,
  command: PumpDispenseCommand,
): number {
  const calibration = resolvePumpCalibration(pump);
  if (command.durationSeconds !== undefined) {
    return command.durationSeconds * 1000;
  }
  return ((command.ml ?? 0) / calibration.mlPerSecond) * 1000;
}

function dispenseVolumeMl(
  pump: PumpSlot,
  command: PumpDispenseCommand,
): number {
  const calibration = resolvePumpCalibration(pump);
  if (command.ml !== undefined) {
    return command.ml;
  }
  return (command.durationSeconds ?? 0) * calibration.mlPerSecond;
}

function startPumpDispenseSimulation(command: PumpDispenseCommand) {
  clearPumpTimer();
  const pump = state.status.pumps?.find(
    (slot) => slot.pumpId === command.pumpId,
  );
  if (!pump) {
    throw new Error('404: pump not found');
  }

  const isContinuousPrime =
    isContinuousDispensePurpose(command.purpose) &&
    command.ml === undefined &&
    command.durationSeconds === undefined;

  if (isContinuousPrime) {
    const maxSeconds = isCleaningPurpose(command.purpose)
      ? MAX_CLEANING_RUN_SECONDS
      : MAX_PRIME_SECONDS;
    const stepLabel = isCleaningPurpose(command.purpose)
      ? cleaningPurposeLabel(command.purpose)
      : 'Priming line…';
    const startedAt = Date.now();
    setPumpJob({
      pumpId: command.pumpId,
      purpose: command.purpose,
      state: 'running',
      progress: 0,
      stepLabel,
      continuous: true,
      elapsedSeconds: 0,
    });

    state.pumpTimer = setInterval(() => {
      const job = state.status.pumpJob;
      if (!job || job.state !== 'running') {
        clearPumpTimer();
        return;
      }

      const elapsedMs = Date.now() - startedAt;
      const elapsedSeconds = Math.floor(elapsedMs / 1000);

      if (elapsedMs >= maxSeconds * 1000) {
        clearPumpTimer();
        clearPumpJob();
        return;
      }

      setPumpJob({
        ...job,
        elapsedSeconds,
        stepLabel,
      });
    }, 500);
    return;
  }

  const durationMs = Math.max(500, dispenseDurationMs(pump, command));
  const volumeMl = dispenseVolumeMl(pump, command);
  const label =
    command.purpose === 'prime'
      ? 'Priming line…'
      : isCleaningPurpose(command.purpose)
        ? cleaningPurposeLabel(command.purpose)
        : command.purpose === 'calibration'
          ? 'Calibration run…'
          : `Pouring ${Math.round(volumeMl)} ml…`;

  setPumpJob({
    pumpId: command.pumpId,
    purpose: command.purpose,
    state: 'running',
    progress: 0,
    stepLabel: label,
    targetMl: command.ml,
    durationSeconds: command.durationSeconds,
  });

  const startedAt = Date.now();
  state.pumpTimer = setInterval(() => {
    const job = state.status.pumpJob;
    if (!job || job.state !== 'running') {
      clearPumpTimer();
      return;
    }

    const elapsed = Date.now() - startedAt;
    const progress = Math.min(100, Math.round((elapsed / durationMs) * 100));

    if (progress >= 100) {
      clearPumpTimer();
      finishTimedPumpJob(pump, command, volumeMl);
      return;
    }

    setPumpJob({ ...job, progress });
  }, 100);
}

function startPourSimulation(command: PourCommand) {
  clearPourTimer();
  const recipe = getRecipeById(command.recipeId);
  const pumped = recipe?.ingredients.filter((i) => i.kind === 'pumped') ?? [];
  let stepIndex = 0;

  setJob({
    recipeId: command.recipeId,
    state: 'pouring',
    progress: 0,
    stepLabel: `Pouring ${pumped[0]?.name ?? 'ingredients'}…`,
  });

  state.pourTimer = setInterval(() => {
    const job = state.status.job;
    if (!job || job.state !== 'pouring') {
      clearPourTimer();
      return;
    }

    const nextProgress = Math.min(job.progress + 4, 100);
    let stepLabel = job.stepLabel;

    if (nextProgress >= 50 && stepIndex === 0 && pumped.length > 1) {
      stepIndex = 1;
      stepLabel = `Pouring ${pumped[1]?.name}…`;
    }

    if (nextProgress >= 100) {
      clearPourTimer();
      subtractInventory(command.steps);
      const prompt = manualPromptForRecipe(command.recipeId);

      if (prompt) {
        setJob({
          recipeId: command.recipeId,
          state: 'prompt',
          progress: 100,
          stepLabel: 'Manual step',
          promptMessage: prompt,
        });
      } else {
        setJob({
          recipeId: command.recipeId,
          state: 'complete',
          progress: 100,
          stepLabel: 'Pour complete',
        });
      }
      return;
    }

    setJob({ ...job, progress: nextProgress, stepLabel });
  }, 120);
}

export function getMockDeviceStatus(): DeviceStatus {
  return cloneStatus(state.status);
}

export function resetMockDevice() {
  clearAllTimers();
  state.status = {
    connected: true,
    firmwareVersion: 'mock-0.1.0',
    hostname: 'rumtime.local',
    bindings: cloneBindings(INITIAL_BINDINGS),
    pumps: buildInitialPumps(),
    notifications: [...INITIAL_NOTIFICATIONS],
    job: null,
    pumpJob: null,
  };
}

function isActivePourJob(job: PourJob | null | undefined): boolean {
  return job?.state === 'pouring' || job?.state === 'prompt';
}

function isActivePumpJob(job: PumpJob | null | undefined): boolean {
  return job?.state === 'running';
}

function assertDeviceIdle() {
  if (
    isActivePourJob(state.status.job) ||
    isActivePumpJob(state.status.pumpJob)
  ) {
    throw new Error('409: device busy');
  }
}

function runDeviceMutation<T>(fn: () => T): Promise<T> {
  return Promise.resolve().then(fn);
}

export class MockDeviceClient implements DeviceClient {
  getStatus(): Promise<DeviceStatus> {
    return runDeviceMutation(() => getMockDeviceStatus());
  }

  startPour(command: PourCommand): Promise<void> {
    return runDeviceMutation(() => {
      assertDeviceIdle();

      for (const step of command.steps) {
        if (!(step.ingredientId in state.status.bindings)) {
          throw new Error('422: ingredient not bound');
        }
        const binding = state.status.bindings[step.ingredientId];

        if (state.status.pumps !== undefined) {
          const assigned = state.status.pumps.some(
            (pump) => pump.ingredientId === step.ingredientId,
          );
          if (!assigned) {
            throw new Error('422: pump unassigned');
          }
        }

        if (!binding.primed) {
          throw new Error('422: line not primed');
        }
      }

      if (state.status.job) {
        setJob(null);
      }

      startPourSimulation(command);
    });
  }

  cancelPour(): Promise<void> {
    return runDeviceMutation(() => {
      clearPourTimer();
      if (state.status.job) {
        setJob({
          ...state.status.job,
          state: 'cancelled',
          stepLabel: 'Pour cancelled',
        });
      }
    });
  }

  acknowledgePrompt(): Promise<void> {
    return runDeviceMutation(() => {
      const job = state.status.job;
      if (!job || job.state !== 'prompt') return;

      setJob({
        ...job,
        state: 'complete',
        stepLabel: 'Pour complete',
        promptMessage: undefined,
      });
    });
  }

  refillIngredient(command: RefillCommand): Promise<void> {
    return runDeviceMutation(() => {
      if (!(command.ingredientId in state.status.bindings)) {
        throw new Error('404: ingredient not bound');
      }
      const binding = state.status.bindings[command.ingredientId];

      binding.remainingMl = binding.bottleSizeMl ?? DEFAULT_BOTTLE_ML;
      binding.primed = true;
    });
  }

  updatePumpBinding(command: PumpBindingCommand): Promise<void> {
    return runDeviceMutation(() => {
    const pump = state.status.pumps?.find(
      (slot) => slot.pumpId === command.pumpId,
    );
    if (!pump) {
      throw new Error('404: pump not found');
    }

    if (command.ingredientId) {
      for (const slot of state.status.pumps ?? []) {
        if (
          slot.pumpId !== command.pumpId &&
          slot.ingredientId === command.ingredientId
        ) {
          slot.ingredientId = null;
        }
      }

      if (!(command.ingredientId in state.status.bindings)) {
        state.status.bindings[command.ingredientId] = {
          ingredientId: command.ingredientId,
          remainingMl: 0,
          bottleSizeMl: DEFAULT_BOTTLE_ML,
          primed: false,
        };
      }
    }

      pump.ingredientId = command.ingredientId;
    });
  }

  updateBottleSize(command: BottleSizeCommand): Promise<void> {
    return runDeviceMutation(() => {
    if (!(command.ingredientId in state.status.bindings)) {
      throw new Error('404: ingredient not bound');
    }
    const binding = state.status.bindings[command.ingredientId];

    binding.bottleSizeMl = command.bottleSizeMl;
      if (binding.remainingMl > command.bottleSizeMl) {
        binding.remainingMl = command.bottleSizeMl;
      }
    });
  }

  updateInventoryLevel(command: InventoryLevelCommand): Promise<void> {
    return runDeviceMutation(() => {
    if (!(command.ingredientId in state.status.bindings)) {
      throw new Error('404: ingredient not bound');
    }
    const binding = state.status.bindings[command.ingredientId];

    const max = binding.bottleSizeMl ?? DEFAULT_BOTTLE_ML;
      binding.remainingMl = Math.min(max, Math.max(0, command.remainingMl));
    });
  }

  updatePumpCalibration(command: PumpCalibrationCommand): Promise<void> {
    return runDeviceMutation(() => {
    const pump = state.status.pumps?.find(
      (slot) => slot.pumpId === command.pumpId,
    );
    if (!pump) {
      throw new Error('404: pump not found');
    }

      pump.mlPerSecond = command.mlPerSecond;
      pump.antiDripMs = command.antiDripMs;
    });
  }

  updatePrimed(command: PrimedCommand): Promise<void> {
    return runDeviceMutation(() => {
    if (!(command.ingredientId in state.status.bindings)) {
      throw new Error('404: ingredient not bound');
    }
    const binding = state.status.bindings[command.ingredientId];

      binding.primed = command.primed;
    });
  }

  startPumpDispense(command: PumpDispenseCommand): Promise<void> {
    return runDeviceMutation(() => {
      assertDeviceIdle();

    const pump = state.status.pumps?.find(
      (slot) => slot.pumpId === command.pumpId,
    );
    if (!pump) {
      throw new Error('404: pump not found');
    }
    if (!pump.ingredientId && !isCleaningPurpose(command.purpose)) {
      throw new Error('422: pump unassigned');
    }

    const binding = pump.ingredientId
      ? state.status.bindings[pump.ingredientId]
      : undefined;
    if (
      command.purpose !== 'prime' &&
      binding &&
      !binding.primed &&
      !isCleaningPurpose(command.purpose)
    ) {
      throw new Error('422: line not primed');
    }

    if (state.status.pumpJob) {
      setPumpJob(null);
    }

      startPumpDispenseSimulation(command);
    });
  }

  cancelPumpDispense(): Promise<void> {
    return runDeviceMutation(() => {
      clearPumpTimer();
      clearPumpJob();
    });
  }
}

export const mockDeviceClient = new MockDeviceClient();
