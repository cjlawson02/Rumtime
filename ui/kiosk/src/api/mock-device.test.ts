import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MockDeviceClient,
  getMockDeviceStatus,
  resetMockDevice,
} from '@/api/mock-device';
import { getRecipeById } from '@/data/load-recipes';
import { MAX_PRIME_SECONDS } from '@/lib/calibration';
import { pourStepsFromRecipe } from '@/lib/pour-steps';

describe('MockDeviceClient', () => {
  beforeEach(() => {
    resetMockDevice();
  });

  function pourCommand(recipeId: string) {
    const recipe = getRecipeById(recipeId);
    if (!recipe) throw new Error(`missing recipe ${recipeId}`);
    return { recipeId, steps: pourStepsFromRecipe(recipe) };
  }

  it('rejects a second pour while prompt is active', async () => {
    const client = new MockDeviceClient();
    await client.updatePumpBinding({ pumpId: 1, ingredientId: 'vodka' });
    await client.startPour(pourCommand('moscow-mule'));

    const status = getMockDeviceStatus();
    expect(status.job?.state).toBe('pouring');

    while (getMockDeviceStatus().job?.state === 'pouring') {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    expect(getMockDeviceStatus().job?.state).toBe('prompt');

    await expect(client.startPour(pourCommand('gin-tonic'))).rejects.toThrow(
      /409/,
    );
  });

  it('runs continuous prime until cancelled', async () => {
    const client = new MockDeviceClient();

    await client.startPumpDispense({
      pumpId: 1,
      purpose: 'prime',
    });

    expect(getMockDeviceStatus().pumpJob?.state).toBe('running');
    expect(getMockDeviceStatus().pumpJob?.continuous).toBe(true);

    await client.cancelPumpDispense();

    expect(getMockDeviceStatus().pumpJob).toBeNull();
  });

  it('clears pumpJob when a timed dispense completes', async () => {
    const client = new MockDeviceClient();

    await client.updatePumpCalibration({
      pumpId: 1,
      mlPerSecond: 15,
      antiDripMs: 100,
    });

    await client.startPumpDispense({
      pumpId: 1,
      purpose: 'verify',
      ml: 15,
    });

    while (getMockDeviceStatus().pumpJob?.state === 'running') {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    expect(getMockDeviceStatus().pumpJob).toBeNull();
  });

  it('rejects pump dispense while recipe pour is active', async () => {
    const client = new MockDeviceClient();
    await client.startPour(pourCommand('old-fashioned'));

    await expect(
      client.startPumpDispense({
        pumpId: 2,
        purpose: 'verify',
        ml: 30,
      }),
    ).rejects.toThrow(/409/);
  });

  it('allows cleaning dispense on an unassigned line', async () => {
    const client = new MockDeviceClient();

    await client.updatePumpBinding({ pumpId: 1, ingredientId: null });

    await client.startPumpDispense({
      pumpId: 1,
      purpose: 'flush',
    });

    expect(getMockDeviceStatus().pumpJob?.state).toBe('running');
    expect(getMockDeviceStatus().pumpJob?.purpose).toBe('flush');

    await client.cancelPumpDispense();
  });

  it('rejects verify dispense when line is not primed', async () => {
    const client = new MockDeviceClient();

    await client.updatePrimed({ ingredientId: 'bourbon', primed: false });

    await expect(
      client.startPumpDispense({
        pumpId: 1,
        purpose: 'verify',
        ml: 30,
      }),
    ).rejects.toThrow(/422.*primed/i);
  });

  it('rejects recipe pour when a pumped line is not primed', async () => {
    const client = new MockDeviceClient();
    await client.updatePrimed({ ingredientId: 'bourbon', primed: false });

    await expect(
      client.startPour(pourCommand('old-fashioned')),
    ).rejects.toThrow(/422.*primed/i);
  });

  it('updates pump calibration and primed state', async () => {
    const client = new MockDeviceClient();

    await client.updatePumpCalibration({
      pumpId: 1,
      mlPerSecond: 2.25,
      antiDripMs: 150,
    });

    const pump = getMockDeviceStatus().pumps?.find((slot) => slot.pumpId === 1);
    expect(pump?.mlPerSecond).toBe(2.25);
    expect(pump?.antiDripMs).toBe(150);

    await client.updatePrimed({ ingredientId: 'bourbon', primed: false });

    expect(getMockDeviceStatus().bindings.bourbon.primed).toBe(false);
  });

  it('completes a pour without a manual prompt', async () => {
    const client = new MockDeviceClient();
    const beforeMl = getMockDeviceStatus().bindings.bourbon.remainingMl;

    await client.startPour(pourCommand('old-fashioned'));

    while (getMockDeviceStatus().job?.state === 'pouring') {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    const status = getMockDeviceStatus();
    expect(status.job?.state).toBe('complete');
    expect(status.bindings.bourbon.remainingMl).toBeLessThan(beforeMl);
  });

  it('acknowledges a post-pour prompt', async () => {
    const client = new MockDeviceClient();
    await client.updatePumpBinding({ pumpId: 1, ingredientId: 'gin' });
    await client.startPour(pourCommand('gin-tonic'));

    while (getMockDeviceStatus().job?.state === 'pouring') {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    expect(getMockDeviceStatus().job?.state).toBe('prompt');

    await client.acknowledgePrompt();

    expect(getMockDeviceStatus().job?.state).toBe('complete');
    expect(getMockDeviceStatus().job?.promptMessage).toBeUndefined();
  });

  it('ignores acknowledgePrompt when no prompt is active', async () => {
    const client = new MockDeviceClient();

    await client.acknowledgePrompt();

    expect(getMockDeviceStatus().job).toBeNull();
  });

  it('cancels an active pour', async () => {
    const client = new MockDeviceClient();
    await client.startPour(pourCommand('old-fashioned'));

    await client.cancelPour();

    expect(getMockDeviceStatus().job?.state).toBe('cancelled');
  });

  it('refills an ingredient to bottle size without changing primed state', async () => {
    const client = new MockDeviceClient();

    await client.updateInventoryLevel({
      ingredientId: 'rum',
      remainingMl: 5,
    });
    await client.updatePrimed({ ingredientId: 'rum', primed: false });

    await client.refillIngredient({ ingredientId: 'rum' });

    const binding = getMockDeviceStatus().bindings.rum;
    expect(binding.remainingMl).toBe(binding.bottleSizeMl);
    expect(binding.primed).toBe(false);
  });

  it('updates bottle size and caps remaining volume', async () => {
    const client = new MockDeviceClient();

    await client.updateBottleSize({
      ingredientId: 'bourbon',
      bottleSizeMl: 300,
    });

    const binding = getMockDeviceStatus().bindings.bourbon;
    expect(binding.bottleSizeMl).toBe(300);
    expect(binding.remainingMl).toBe(300);
  });

  it('clamps inventory level updates to bottle size', async () => {
    const client = new MockDeviceClient();

    await client.updateInventoryLevel({
      ingredientId: 'bourbon',
      remainingMl: 9999,
    });
    expect(getMockDeviceStatus().bindings.bourbon.remainingMl).toBe(750);

    await client.updateInventoryLevel({
      ingredientId: 'bourbon',
      remainingMl: -10,
    });
    expect(getMockDeviceStatus().bindings.bourbon.remainingMl).toBe(0);
  });

  it('assigns pump bindings and clears duplicate assignments', async () => {
    const client = new MockDeviceClient();

    await client.updatePumpBinding({ pumpId: 2, ingredientId: 'bourbon' });

    const pumps = getMockDeviceStatus().pumps ?? [];
    expect(pumps.find((slot) => slot.pumpId === 1)?.ingredientId).toBeNull();
    expect(pumps.find((slot) => slot.pumpId === 2)?.ingredientId).toBe('bourbon');
  });

  it('creates a binding when assigning a new ingredient', async () => {
    const client = new MockDeviceClient();
    const newIngredientId = 'new_syrup';

    await client.updatePumpBinding({
      pumpId: 2,
      ingredientId: newIngredientId,
    });

    const binding = getMockDeviceStatus().bindings[newIngredientId];
    expect(binding).toMatchObject({
      ingredientId: newIngredientId,
      remainingMl: 0,
      bottleSizeMl: 750,
      primed: false,
    });
  });

  it('rejects unknown ingredients and pumps', async () => {
    const client = new MockDeviceClient();

    await expect(
      client.refillIngredient({ ingredientId: 'missing' }),
    ).rejects.toThrow(/422/);
    await expect(
      client.updatePumpBinding({ pumpId: 99, ingredientId: 'bourbon' }),
    ).rejects.toThrow(/422/);
    await expect(
      client.startPumpDispense({ pumpId: 99, purpose: 'verify', ml: 10 }),
    ).rejects.toThrow(/422/);
  });

  it('rejects pours for unbound ingredients and unassigned pumps', async () => {
    const client = new MockDeviceClient();

    await expect(
      client.startPour({
        recipeId: 'test',
        steps: [{ ingredientId: 'missing', ml: 30 }],
      }),
    ).rejects.toThrow(/422.*bound/i);

    await client.updatePumpBinding({ pumpId: 1, ingredientId: null });
    await expect(client.startPour(pourCommand('old-fashioned'))).rejects.toThrow(
      /422.*unassigned/i,
    );
  });

  it('rejects pump dispense on an unassigned line for verify runs', async () => {
    const client = new MockDeviceClient();
    await client.updatePumpBinding({ pumpId: 1, ingredientId: null });

    await expect(
      client.startPumpDispense({
        pumpId: 1,
        purpose: 'verify',
        ml: 20,
      }),
    ).rejects.toThrow(/422.*unassigned/i);
  });

  it('rejects recipe pour while a pump job is active', async () => {
    const client = new MockDeviceClient();

    await client.startPumpDispense({
      pumpId: 1,
      purpose: 'prime',
    });

    await expect(client.startPour(pourCommand('old-fashioned'))).rejects.toThrow(
      /409/,
    );

    await client.cancelPumpDispense();
  });

  it('deducts inventory for timed dispense by durationSeconds', async () => {
    const client = new MockDeviceClient();
    const beforeMl = getMockDeviceStatus().bindings.bourbon.remainingMl;

    await client.updatePumpCalibration({
      pumpId: 1,
      mlPerSecond: 10,
      antiDripMs: 100,
    });

    await client.startPumpDispense({
      pumpId: 1,
      purpose: 'calibration',
      durationSeconds: 1,
    });

    while (getMockDeviceStatus().pumpJob?.state === 'running') {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    expect(getMockDeviceStatus().bindings.bourbon.remainingMl).toBeLessThan(
      beforeMl,
    );
  });

  it('runs continuous cleaning until cancelled', async () => {
    const client = new MockDeviceClient();

    await client.startPumpDispense({
      pumpId: 1,
      purpose: 'sanitize',
    });

    expect(getMockDeviceStatus().pumpJob?.continuous).toBe(true);
    expect(getMockDeviceStatus().pumpJob?.stepLabel).toMatch(/sanitize/i);

    await client.cancelPumpDispense();
    expect(getMockDeviceStatus().pumpJob).toBeNull();
  });

  it('returns cloned status and resets mock state', async () => {
    const client = new MockDeviceClient();
    await client.updatePrimed({ ingredientId: 'bourbon', primed: false });

    const snapshot = getMockDeviceStatus();
    snapshot.bindings.bourbon.primed = true;

    expect(getMockDeviceStatus().bindings.bourbon.primed).toBe(false);

    resetMockDevice();
    expect(getMockDeviceStatus().bindings.bourbon.primed).toBe(true);
    await expect(client.getStatus()).resolves.toMatchObject({ connected: true });
  });

  it('rejects inventory and calibration updates for unknown ingredients', async () => {
    const client = new MockDeviceClient();

    await expect(
      client.updateBottleSize({ ingredientId: 'missing', bottleSizeMl: 750 }),
    ).rejects.toThrow(/422/);
    await expect(
      client.updateInventoryLevel({
        ingredientId: 'missing',
        remainingMl: 100,
      }),
    ).rejects.toThrow(/422/);
    await expect(
      client.updatePrimed({ ingredientId: 'missing', primed: true }),
    ).rejects.toThrow(/422/);
    await expect(
      client.updatePumpCalibration({
        pumpId: 99,
        mlPerSecond: 2,
        antiDripMs: 100,
      }),
    ).rejects.toThrow(/422/);
  });

  it('auto-stops continuous prime after the firmware safety limit', async () => {
    vi.useFakeTimers();
    const client = new MockDeviceClient();

    await client.startPumpDispense({
      pumpId: 1,
      purpose: 'prime',
    });

    await vi.advanceTimersByTimeAsync(MAX_PRIME_SECONDS * 1000 + 1000);

    expect(getMockDeviceStatus().pumpJob).toBeNull();
    vi.useRealTimers();
  });

  it('updates pour step labels for multi-ingredient recipes', async () => {
    const client = new MockDeviceClient();
    await client.startPour(pourCommand('old-fashioned'));

    while (getMockDeviceStatus().job?.progress !== undefined &&
      getMockDeviceStatus().job!.progress < 60) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    expect(getMockDeviceStatus().job?.stepLabel).toMatch(/simple/i);
  });

  it('clears an existing job before starting a new pour', async () => {
    const client = new MockDeviceClient();
    await client.startPour(pourCommand('old-fashioned'));
    await client.cancelPour();

    await new Promise((resolve) => setTimeout(resolve, 600));

    await client.startPour(pourCommand('old-fashioned'));

    expect(getMockDeviceStatus().job?.state).toBe('pouring');
  });

  it('rejects pours when inventory is below step total plus reserve', async () => {
    const client = new MockDeviceClient();

    await client.updateInventoryLevel({
      ingredientId: 'bourbon',
      remainingMl: 50,
    });

    await expect(client.startPour(pourCommand('old-fashioned'))).rejects.toThrow(
      /422.*inventory/i,
    );
  });

  it('clears complete job after terminal latch', async () => {
    const client = new MockDeviceClient();
    await client.startPour(pourCommand('old-fashioned'));

    while (getMockDeviceStatus().job?.state === 'pouring') {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    expect(getMockDeviceStatus().job?.state).toBe('complete');

    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(getMockDeviceStatus().job).toBeNull();
  });

  it('deducts inventory per pour step as progress advances', async () => {
    const client = new MockDeviceClient();
    const bourbonBefore = getMockDeviceStatus().bindings.bourbon.remainingMl;
    const simpleBefore = getMockDeviceStatus().bindings.simple.remainingMl;

    await client.startPour(pourCommand('old-fashioned'));

    while (
      getMockDeviceStatus().job?.progress !== undefined &&
      getMockDeviceStatus().job!.progress < 55
    ) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    const midBourbon = getMockDeviceStatus().bindings.bourbon.remainingMl;
    const midSimple = getMockDeviceStatus().bindings.simple.remainingMl;
    expect(midBourbon).toBeLessThan(bourbonBefore);
    expect(midSimple).toBe(simpleBefore);

    while (getMockDeviceStatus().job?.state === 'pouring') {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    expect(getMockDeviceStatus().bindings.simple.remainingMl).toBeLessThan(
      simpleBefore,
    );
  });
});
