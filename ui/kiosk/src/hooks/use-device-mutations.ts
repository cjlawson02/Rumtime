import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import { deviceClient } from '@/api';
import type {
  BottleSizeCommand,
  DeviceStatus,
  InventoryLevelCommand,
  PourCommand,
  PrimedCommand,
  PumpBindingCommand,
  PumpCalibrationCommand,
  PumpDispenseCommand,
  RefillCommand,
} from '@/api/types';
import {
  deviceStatusQueryKeyPrefix,
} from '@/hooks/use-device-status';
import { isActivePourJob, isTerminalPourJob } from '@/lib/pour-job';

function invalidateDeviceStatus(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: deviceStatusQueryKeyPrefix });
}

function getCachedDeviceStatus(
  queryClient: QueryClient,
): DeviceStatus | undefined {
  const matches = queryClient.getQueriesData<DeviceStatus>({
    queryKey: deviceStatusQueryKeyPrefix,
  });
  return matches.map(([, data]) => data).find((data) => data !== undefined);
}

/** Drop a prior attempt's terminal job so UI does not sticky-show it until poll. */
function clearStaleTerminalPourJob(queryClient: QueryClient) {
  queryClient.setQueriesData<DeviceStatus>(
    { queryKey: deviceStatusQueryKeyPrefix },
    (prev) => {
      if (!prev?.job || isActivePourJob(prev.job)) return prev;
      if (!isTerminalPourJob(prev.job)) return prev;
      return { ...prev, job: null };
    },
  );
}

/** Drop a prior pump dispense terminal so wizards do not sticky-show it. */
function clearStaleTerminalPumpJob(queryClient: QueryClient) {
  queryClient.setQueriesData<DeviceStatus>(
    { queryKey: deviceStatusQueryKeyPrefix },
    (prev) => {
      if (!prev?.pumpJob || prev.pumpJob.state === 'running') return prev;
      return { ...prev, pumpJob: null };
    },
  );
}

function bindingPrimed(
  status: DeviceStatus | undefined,
  ingredientId: string,
): boolean | undefined {
  return status?.bindings[ingredientId]?.primed;
}

function useDeviceStatusInvalidator() {
  const queryClient = useQueryClient();
  return () => invalidateDeviceStatus(queryClient);
}

export function useStartPour() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: PourCommand) => deviceClient.startPour(command),
    onSuccess: () => {
      clearStaleTerminalPourJob(queryClient);
      return invalidateDeviceStatus(queryClient);
    },
  });
}

export function useCancelPour() {
  const invalidate = useDeviceStatusInvalidator();
  return useMutation({
    mutationFn: () => deviceClient.cancelPour(),
    onSuccess: invalidate,
  });
}

export function useAcknowledgePrompt() {
  const invalidate = useDeviceStatusInvalidator();
  return useMutation({
    mutationFn: () => deviceClient.acknowledgePrompt(),
    onSuccess: invalidate,
  });
}

export function useStartPumpDispense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: PumpDispenseCommand) =>
      deviceClient.startPumpDispense(command),
    onSuccess: () => {
      clearStaleTerminalPumpJob(queryClient);
      return invalidateDeviceStatus(queryClient);
    },
  });
}

export function useCancelPumpDispense() {
  const invalidate = useDeviceStatusInvalidator();
  return useMutation({
    mutationFn: () => deviceClient.cancelPumpDispense(),
    onSuccess: invalidate,
  });
}

export function useUpdatePumpBinding() {
  const invalidate = useDeviceStatusInvalidator();
  return useMutation({
    mutationFn: (command: PumpBindingCommand) =>
      deviceClient.updatePumpBinding(command),
    onSuccess: invalidate,
  });
}

export function useUpdatePrimed() {
  const invalidate = useDeviceStatusInvalidator();
  return useMutation({
    mutationFn: (command: PrimedCommand) => deviceClient.updatePrimed(command),
    onSuccess: invalidate,
  });
}

export function useRefillIngredient() {
  const invalidate = useDeviceStatusInvalidator();
  return useMutation({
    mutationFn: (command: RefillCommand) =>
      deviceClient.refillIngredient(command),
    onSuccess: invalidate,
  });
}

export function useUpdateBottleSize() {
  const invalidate = useDeviceStatusInvalidator();
  return useMutation({
    mutationFn: (command: BottleSizeCommand) =>
      deviceClient.updateBottleSize(command),
    onSuccess: invalidate,
  });
}

export function useUpdateInventoryLevel() {
  const invalidate = useDeviceStatusInvalidator();
  return useMutation({
    mutationFn: (command: InventoryLevelCommand) =>
      deviceClient.updateInventoryLevel(command),
    onSuccess: invalidate,
  });
}

export function useUpdatePumpCalibration() {
  const invalidate = useDeviceStatusInvalidator();
  return useMutation({
    mutationFn: (command: PumpCalibrationCommand) =>
      deviceClient.updatePumpCalibration(command),
    onSuccess: invalidate,
  });
}

type IngredientSwapInput = {
  pumpId: number;
  fromIngredientId: string | null;
  toIngredientId: string | null;
};

export function useApplyIngredientSwap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      pumpId,
      fromIngredientId,
      toIngredientId,
    }: IngredientSwapInput) => {
      const cachedStatus = getCachedDeviceStatus(queryClient);
      const primedRollback: Array<{ ingredientId: string; primed: boolean }> =
        [];

      await deviceClient.updatePumpBinding({
        pumpId,
        ingredientId: toIngredientId,
      });

      try {
        if (toIngredientId) {
          const priorPrimed = bindingPrimed(cachedStatus, toIngredientId);
          await deviceClient.updatePrimed({
            ingredientId: toIngredientId,
            primed: false,
          });
          if (priorPrimed !== undefined) {
            primedRollback.push({
              ingredientId: toIngredientId,
              primed: priorPrimed,
            });
          }
        }

        if (fromIngredientId && fromIngredientId !== toIngredientId) {
          const priorPrimed = bindingPrimed(cachedStatus, fromIngredientId);
          await deviceClient.updatePrimed({
            ingredientId: fromIngredientId,
            primed: false,
          });
          if (priorPrimed !== undefined) {
            primedRollback.push({
              ingredientId: fromIngredientId,
              primed: priorPrimed,
            });
          }
        }
      } catch (error) {
        try {
          await deviceClient.updatePumpBinding({
            pumpId,
            ingredientId: fromIngredientId,
          });
          for (const snapshot of primedRollback.reverse()) {
            await deviceClient.updatePrimed(snapshot);
          }
        } catch {
          // Best-effort rollback; surface original failure.
        }
        throw error;
      }
    },
    onSuccess: () => invalidateDeviceStatus(queryClient),
  });
}
