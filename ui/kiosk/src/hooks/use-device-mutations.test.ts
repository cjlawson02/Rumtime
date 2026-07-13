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
import { deviceStatusQueryKey } from '@/lib/device-query-keys';
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

async function expectCommandMutationInvalidates<TInput>(
  hook: () => { mutateAsync: (input: TInput) => Promise<unknown> },
  mutate: ReturnType<typeof vi.fn>,
  input: TInput,
) {
  const queryClient = createQueryClient();
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  const { result } = renderHook(() => hook(), {
    wrapper: createWrapper({ queryClient }),
  });

  await act(async () => {
    await result.current.mutateAsync(input);
  });

  expect(mutate).toHaveBeenCalledWith(input);
  await waitFor(() => {
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: deviceStatusQueryKeyPrefix,
    });
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
      hook: useCancelPour,
      mutate: cancelPour,
    },
    {
      hook: useAcknowledgePrompt,
      mutate: acknowledgePrompt,
    },
    {
      hook: useCancelPumpDispense,
      mutate: cancelPumpDispense,
    },
  ])('calls deviceClient and invalidates status for $hook.name', async ({
    hook,
    mutate,
  }) => {
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => hook(), {
      wrapper: createWrapper({ queryClient }),
    });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(mutate).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: deviceStatusQueryKeyPrefix,
      });
    });
  });

  it.each([
    {
      name: 'useStartPour',
      run: () =>
        expectCommandMutationInvalidates(useStartPour, startPour, {
          recipeId: 'old-fashioned',
          steps: [{ ingredientId: 'bourbon', ml: 45 }],
        }),
    },
    {
      name: 'useStartPumpDispense',
      run: () =>
        expectCommandMutationInvalidates(
          useStartPumpDispense,
          startPumpDispense,
          { pumpId: 1, purpose: 'verify' as const, ml: 30 },
        ),
    },
    {
      name: 'useUpdatePumpBinding',
      run: () =>
        expectCommandMutationInvalidates(
          useUpdatePumpBinding,
          updatePumpBinding,
          { pumpId: 1, ingredientId: 'bourbon' },
        ),
    },
    {
      name: 'useUpdatePrimed',
      run: () =>
        expectCommandMutationInvalidates(useUpdatePrimed, updatePrimed, {
          ingredientId: 'bourbon',
          primed: true,
        }),
    },
    {
      name: 'useRefillIngredient',
      run: () =>
        expectCommandMutationInvalidates(useRefillIngredient, refillIngredient, {
          ingredientId: 'bourbon',
        }),
    },
    {
      name: 'useUpdateBottleSize',
      run: () =>
        expectCommandMutationInvalidates(
          useUpdateBottleSize,
          updateBottleSize,
          { ingredientId: 'bourbon', bottleSizeMl: 1000 },
        ),
    },
    {
      name: 'useUpdateInventoryLevel',
      run: () =>
        expectCommandMutationInvalidates(
          useUpdateInventoryLevel,
          updateInventoryLevel,
          { ingredientId: 'bourbon', remainingMl: 250 },
        ),
    },
    {
      name: 'useUpdatePumpCalibration',
      run: () =>
        expectCommandMutationInvalidates(
          useUpdatePumpCalibration,
          updatePumpCalibration,
          { pumpId: 1, mlPerSecond: 2.5, antiDripMs: 120 },
        ),
    },
  ])('calls deviceClient and invalidates status for $name', async ({ run }) => {
    await run();
  });

  it('clears a stale terminal pour job from the cache on start success', async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(deviceStatusQueryKey(), {
      connected: true,
      bindings: {},
      job: {
        recipeId: 'old-fashioned',
        state: 'cancelled',
        progress: 0,
        stepLabel: 'Cancelled',
      },
    });
    const { result } = renderHook(() => useStartPour(), {
      wrapper: createWrapper({ queryClient }),
    });

    await act(async () => {
      await result.current.mutateAsync({
        recipeId: 'old-fashioned',
        steps: [{ ingredientId: 'bourbon', ml: 45 }],
      });
    });

    expect(queryClient.getQueryData(deviceStatusQueryKey())).toMatchObject({
      job: null,
    });
  });

  it('clears a stale terminal pump job from the cache on dispense start', async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(deviceStatusQueryKey(), {
      connected: true,
      bindings: {},
      pumpJob: {
        pumpId: 1,
        purpose: 'prime',
        state: 'complete',
        progress: 100,
        stepLabel: 'Done',
      },
    });
    const { result } = renderHook(() => useStartPumpDispense(), {
      wrapper: createWrapper({ queryClient }),
    });

    await act(async () => {
      await result.current.mutateAsync({
        pumpId: 1,
        purpose: 'prime',
      });
    });

    expect(queryClient.getQueryData(deviceStatusQueryKey())).toMatchObject({
      pumpJob: null,
    });
  });

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

  it('restores primed flags when a later primed update fails', async () => {
    updatePrimed
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('422: line not primed'));
    const queryClient = createQueryClient();
    queryClient.setQueryData(deviceStatusQueryKey(), {
      connected: true,
      bindings: {
        bourbon: {
          ingredientId: 'bourbon',
          remainingMl: 750,
          bottleSizeMl: 750,
          primed: true,
        },
        gin: {
          ingredientId: 'gin',
          remainingMl: 750,
          bottleSizeMl: 750,
          primed: true,
        },
      },
      pumps: [],
    });
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

    expect(updatePrimed).toHaveBeenCalledWith({
      ingredientId: 'gin',
      primed: true,
    });
    expect(updatePrimed).not.toHaveBeenCalledWith({
      ingredientId: 'bourbon',
      primed: true,
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
