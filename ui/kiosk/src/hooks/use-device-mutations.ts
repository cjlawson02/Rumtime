import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import { deviceClient } from '@/api';
import type {
  BottleSizeCommand,
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

function invalidateDeviceStatus(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: deviceStatusQueryKeyPrefix });
}

function useDeviceStatusInvalidator() {
  const queryClient = useQueryClient();
  return () => invalidateDeviceStatus(queryClient);
}

export function useStartPour() {
  const invalidate = useDeviceStatusInvalidator();
  return useMutation({
    mutationFn: (command: PourCommand) => deviceClient.startPour(command),
    onSuccess: invalidate,
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
  const invalidate = useDeviceStatusInvalidator();
  return useMutation({
    mutationFn: (command: PumpDispenseCommand) =>
      deviceClient.startPumpDispense(command),
    onSuccess: invalidate,
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
      await deviceClient.updatePumpBinding({
        pumpId,
        ingredientId: toIngredientId,
      });

      try {
        if (toIngredientId) {
          await deviceClient.updatePrimed({
            ingredientId: toIngredientId,
            primed: false,
          });
        }

        if (fromIngredientId && fromIngredientId !== toIngredientId) {
          await deviceClient.updatePrimed({
            ingredientId: fromIngredientId,
            primed: false,
          });
        }
      } catch (error) {
        try {
          await deviceClient.updatePumpBinding({
            pumpId,
            ingredientId: fromIngredientId,
          });
        } catch {
          // Best-effort rollback; surface original failure.
        }
        throw error;
      }
    },
    onSuccess: () => invalidateDeviceStatus(queryClient),
  });
}
