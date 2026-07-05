import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HttpDeviceClient } from '@/api/http-device';
import { deviceStatusSchema } from '@/api/types';
import { DeviceApiError } from '@/lib/device-errors';

const validStatus = deviceStatusSchema.parse({
  connected: true,
  bindings: {},
  job: null,
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function emptyResponse(status = 204) {
  return new Response(null, { status });
}

describe('HttpDeviceClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('parses a valid /status payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(jsonResponse(validStatus)),
    );

    const client = new HttpDeviceClient('http://rumtime.local');
    await expect(client.getStatus()).resolves.toEqual(validStatus);
    expect(fetch).toHaveBeenCalledWith(
      'http://rumtime.local/status',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('normalizes idle jobs to null in /status', async () => {
    const statusWithIdleJob = {
      connected: true,
      bindings: {},
      job: {
        recipeId: 'old-fashioned',
        state: 'idle',
        progress: 0,
        stepLabel: 'Idle',
      },
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(statusWithIdleJob)),
    );

    const client = new HttpDeviceClient('http://rumtime.local');
    await expect(client.getStatus()).resolves.toMatchObject({ job: null });
  });

  it('throws on invalid /status payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ connected: 'nope' })),
    );

    const client = new HttpDeviceClient('http://rumtime.local');
    await expect(client.getStatus()).rejects.toThrow(/format invalid/i);
  });

  it('throws when /status is not valid JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('not-json', { status: 200 })),
    );

    const client = new HttpDeviceClient('http://rumtime.local');
    await expect(client.getStatus()).rejects.toThrow(/not valid JSON/i);
  });

  it('throws on non-ok /status responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ message: 'Service unavailable' }, 503),
      ),
    );

    const client = new HttpDeviceClient('http://rumtime.local');
    await expect(client.getStatus()).rejects.toMatchObject({
      status: 503,
      message: 'Service unavailable',
    });
  });

  it('times out getStatus when an external abort signal is also provided', async () => {
    vi.useFakeTimers();
    const external = new AbortController();

    vi.stubGlobal(
      'fetch',
      vi.fn((_url, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        });
      }),
    );

    const client = new HttpDeviceClient('http://192.168.1.1');
    const statusPromise = client.getStatus({ signal: external.signal });

    await vi.advanceTimersByTimeAsync(2600);
    await expect(statusPromise).rejects.toBeDefined();
    vi.useRealTimers();
  });

  it('merges external abort signals without AbortSignal.any', async () => {
    const originalAny = AbortSignal.any;
    // @ts-expect-error test fallback path when AbortSignal.any is unavailable
    AbortSignal.any = undefined;

    const external = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn((_url, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        });
      }),
    );

    const client = new HttpDeviceClient('http://rumtime.local');
    const statusPromise = client.getStatus({ signal: external.signal });
    external.abort();

    await expect(statusPromise).rejects.toBeDefined();
    AbortSignal.any = originalAny;
  });

  it('parses 422 error bodies for pour', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ error: 'not_primed' }, 422),
      ),
    );

    const client = new HttpDeviceClient('http://rumtime.local');
    await expect(
      client.startPour({
        recipeId: 'test',
        steps: [{ ingredientId: 'rum', ml: 45 }],
      }),
    ).rejects.toMatchObject({ status: 422, code: 'not_primed' });
  });

  it('uses message-only error bodies when code is absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ message: 'Pump busy' }, 409),
      ),
    );

    const client = new HttpDeviceClient('http://rumtime.local');
    await expect(client.cancelPour()).rejects.toMatchObject({
      status: 409,
      message: 'Pump busy',
    });
  });

  it('falls back to status text when error bodies are not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('bad gateway', { status: 502 })),
    );

    const client = new HttpDeviceClient('http://rumtime.local');
    const promise = client.acknowledgePrompt();
    await expect(promise).rejects.toBeInstanceOf(DeviceApiError);
    await expect(promise).rejects.toMatchObject({
      status: 502,
      message: 'Device API 502',
    });
  });

  it('uses error code as message when message is absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ error: 'low_inventory' }, 422)),
    );

    const client = new HttpDeviceClient('http://rumtime.local');
    await expect(
      client.refillIngredient({ ingredientId: 'bourbon' }),
    ).rejects.toMatchObject({
      status: 422,
      code: 'low_inventory',
      message: 'low_inventory',
    });
  });

  it('posts inventory and pump mutations successfully', async () => {
    const fetchMock = vi.fn().mockResolvedValue(emptyResponse());
    vi.stubGlobal('fetch', fetchMock);

    const client = new HttpDeviceClient('http://rumtime.local');

    await client.refillIngredient({ ingredientId: 'bourbon' });
    await client.updatePumpBinding({ pumpId: 1, ingredientId: 'bourbon' });
    await client.updateBottleSize({ ingredientId: 'bourbon', bottleSizeMl: 1000 });
    await client.updateInventoryLevel({
      ingredientId: 'bourbon',
      remainingMl: 250,
    });
    await client.updatePumpCalibration({
      pumpId: 1,
      mlPerSecond: 2.5,
      antiDripMs: 120,
    });
    await client.updatePrimed({ ingredientId: 'bourbon', primed: true });
    await client.startPumpDispense({
      pumpId: 1,
      purpose: 'verify',
      ml: 30,
    });
    await client.cancelPumpDispense();

    expect(fetchMock).toHaveBeenCalledTimes(8);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://rumtime.local/inventory/refill',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://rumtime.local/pumps/dispense/cancel',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('rejects invalid mutation payloads before fetch', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const client = new HttpDeviceClient('http://rumtime.local');

    await expect(
      client.startPour({ recipeId: 'test', steps: [] }),
    ).rejects.toThrow();
    await expect(
      client.updatePumpCalibration({
        pumpId: 1,
        mlPerSecond: 0,
        antiDripMs: 100,
      }),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('resolves configured base URL from getDeviceApiBase when omitted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(validStatus)),
    );

    const client = new HttpDeviceClient();
    await client.getStatus();

    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/status$/),
      expect.any(Object),
    );
  });

  it('succeeds for pour cancel and acknowledge endpoints', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(emptyResponse()));

    const client = new HttpDeviceClient('http://rumtime.local');
    await expect(client.startPour({
      recipeId: 'test',
      steps: [{ ingredientId: 'rum', ml: 45 }],
    })).resolves.toBeUndefined();
    await expect(client.cancelPour()).resolves.toBeUndefined();
    await expect(client.acknowledgePrompt()).resolves.toBeUndefined();
  });

  it('throws device errors for failed write endpoints', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ error: 'device_busy' }, 409),
      ),
    );

    const client = new HttpDeviceClient('http://rumtime.local');

    await expect(
      client.updateBottleSize({ ingredientId: 'bourbon', bottleSizeMl: 1000 }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      client.updateInventoryLevel({
        ingredientId: 'bourbon',
        remainingMl: 250,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      client.updatePumpCalibration({
        pumpId: 1,
        mlPerSecond: 2.5,
        antiDripMs: 120,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      client.updatePrimed({ ingredientId: 'bourbon', primed: false }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      client.startPumpDispense({
        pumpId: 1,
        purpose: 'verify',
        ml: 30,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(client.cancelPumpDispense()).rejects.toMatchObject({
      status: 409,
    });
  });

  it('aborts immediately when external signal is already aborted', async () => {
    const originalAny = AbortSignal.any;
    // @ts-expect-error test fallback path when AbortSignal.any is unavailable
    AbortSignal.any = undefined;

    const external = new AbortController();
    external.abort();

    vi.stubGlobal(
      'fetch',
      vi.fn((_url, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
          if (init?.signal?.aborted) {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          }
        });
      }),
    );

    const client = new HttpDeviceClient('http://rumtime.local');
    await expect(client.getStatus({ signal: external.signal })).rejects.toBeDefined();
    AbortSignal.any = originalAny;
  });
});
