import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useAcknowledgePrompt,
  useApplyIngredientSwap,
  useCancelPour,
  useCancelPumpDispense,
  useRefillIngredient,
  useStartPour,
  useStartPumpDispense,
  useUpdateBottleSize,
  useUpdateInventoryLevel,
  useUpdatePrimed,
  useUpdatePumpBinding,
  useUpdatePumpCalibration,
} from '@/hooks/use-device-mutations';
import { deviceStatusQueryKeyPrefix } from '@/hooks/use-device-status';
import { createWrapper } from '@/test/render';

const {
  startPour,
  cancelPour,
  acknowledgePrompt,
  startPumpDispense,
  cancelPumpDispense,
  updatePumpBinding,
  updatePrimed,
  refillIngredient,
  updateBottleSize,
  updateInventoryLevel,
  updatePumpCalibration,
} = vi.hoisted(() => ({
  startPour: vi.fn(),
  cancelPour: vi.fn(),
  acknowledgePrompt: vi.fn(),
  startPumpDispense: vi.fn(),
  cancelPumpDispense: vi.fn(),
  updatePumpBinding: vi.fn(),
  updatePrimed: vi.fn(),
  refillIngredient: vi.fn(),
  updateBottleSize: vi.fn(),
  updateInventoryLevel: vi.fn(),
  updatePumpCalibration: vi.fn(),
}));

vi.mock('@/api', () => ({
  deviceClient: {
    startPour,
    cancelPour,
    acknowledgePrompt,
    startPumpDispense,
    cancelPumpDispense,
    updatePumpBinding,
    updatePrimed,
    refillIngredient,
    updateBottleSize,
    updateInventoryLevel,
    updatePumpCalibration,
  },
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

describe('useDeviceMutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    startPour.mockResolvedValue(undefined);
    cancelPour.mockResolvedValue(undefined);
    acknowledgePrompt.mockResolvedValue(undefined);
    startPumpDispense.mockResolvedValue(undefined);
    cancelPumpDispense.mockResolvedValue(undefined);
    updatePumpBinding.mockResolvedValue(undefined);
    updatePrimed.mockResolvedValue(undefined);
    refillIngredient.mockResolvedValue(undefined);
    updateBottleSize.mockResolvedValue(undefined);
    updateInventoryLevel.mockResolvedValue(undefined);
    updatePumpCalibration.mockResolvedValue(undefined);
  });

  it.each([
    {
      hook: useStartPour,
      mutate: startPour,
      input: {
        recipeId: 'old-fashioned',
        steps: [{ ingredientId: 'bourbon', ml: 45 }],
      },
    },
    {
      hook: useCancelPour,
      mutate: cancelPour,
      input: undefined,
    },
    {
      hook: useAcknowledgePrompt,
      mutate: acknowledgePrompt,
      input: undefined,
    },
    {
      hook: useStartPumpDispense,
      mutate: startPumpDispense,
      input: { pumpId: 1, purpose: 'verify' as const, ml: 30 },
    },
    {
      hook: useCancelPumpDispense,
      mutate: cancelPumpDispense,
      input: undefined,
    },
    {
      hook: useUpdatePumpBinding,
      mutate: updatePumpBinding,
      input: { pumpId: 1, ingredientId: 'bourbon' },
    },
    {
      hook: useUpdatePrimed,
      mutate: updatePrimed,
      input: { ingredientId: 'bourbon', primed: true },
    },
    {
      hook: useRefillIngredient,
      mutate: refillIngredient,
      input: { ingredientId: 'bourbon' },
    },
    {
      hook: useUpdateBottleSize,
      mutate: updateBottleSize,
      input: { ingredientId: 'bourbon', bottleSizeMl: 1000 },
    },
    {
      hook: useUpdateInventoryLevel,
      mutate: updateInventoryLevel,
      input: { ingredientId: 'bourbon', remainingMl: 250 },
    },
    {
      hook: useUpdatePumpCalibration,
      mutate: updatePumpCalibration,
      input: { pumpId: 1, mlPerSecond: 2.5, antiDripMs: 120 },
    },
  ])(
    'calls deviceClient and invalidates status for $hook.name',
    async ({ hook, mutate, input }) => {
      const queryClient = createQueryClient();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
      const { result } = renderHook(() => hook(), {
        wrapper: createWrapper({ queryClient }),
      });

      await act(async () => {
        if (input === undefined) {
          await result.current.mutateAsync();
        } else {
          await result.current.mutateAsync(input);
        }
      });

      if (input === undefined) {
        expect(mutate).toHaveBeenCalledOnce();
      } else {
        expect(mutate).toHaveBeenCalledWith(input);
      }
      await waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: deviceStatusQueryKeyPrefix,
        });
      });
    },
  );

  it('applies ingredient swaps and clears primed state', async () => {
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useApplyIngredientSwap(), {
      wrapper: createWrapper({ queryClient }),
    });

    await act(async () => {
      await result.current.mutateAsync({
        pumpId: 2,
        fromIngredientId: 'bourbon',
        toIngredientId: 'gin',
      });
    });

    expect(updatePumpBinding).toHaveBeenNthCalledWith(1, {
      pumpId: 2,
      ingredientId: 'gin',
    });
    expect(updatePrimed).toHaveBeenCalledWith({
      ingredientId: 'gin',
      primed: false,
    });
    expect(updatePrimed).toHaveBeenCalledWith({
      ingredientId: 'bourbon',
      primed: false,
    });
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: deviceStatusQueryKeyPrefix,
      });
    });
  });

  it('rolls back pump binding when primed updates fail', async () => {
    updatePrimed.mockRejectedValueOnce(new Error('422: line not primed'));
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useApplyIngredientSwap(), {
      wrapper: createWrapper({ queryClient }),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          pumpId: 2,
          fromIngredientId: 'bourbon',
          toIngredientId: 'gin',
        }),
      ).rejects.toThrow(/primed/i);
    });

    expect(updatePumpBinding).toHaveBeenNthCalledWith(2, {
      pumpId: 2,
      ingredientId: 'bourbon',
    });
  });

  it('surfaces the original swap error when rollback also fails', async () => {
    updatePrimed.mockRejectedValueOnce(new Error('422: line not primed'));
    updatePumpBinding
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('rollback failed'));
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useApplyIngredientSwap(), {
      wrapper: createWrapper({ queryClient }),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          pumpId: 2,
          fromIngredientId: 'bourbon',
          toIngredientId: 'gin',
        }),
      ).rejects.toThrow(/primed/i);
    });
  });

  it('clears only the previous ingredient when unassigning a pump', async () => {
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useApplyIngredientSwap(), {
      wrapper: createWrapper({ queryClient }),
    });

    await act(async () => {
      await result.current.mutateAsync({
        pumpId: 2,
        fromIngredientId: 'bourbon',
        toIngredientId: null,
      });
    });

    expect(updatePumpBinding).toHaveBeenCalledWith({
      pumpId: 2,
      ingredientId: null,
    });
    expect(updatePrimed).toHaveBeenCalledOnce();
    expect(updatePrimed).toHaveBeenCalledWith({
      ingredientId: 'bourbon',
      primed: false,
    });
  });
});
