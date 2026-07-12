import type { DeviceClient, GetStatusOptions } from '@/api/device-client';
import { getDeviceApiBase } from '@/lib/device-endpoint';
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
  bottleSizeCommandSchema,
  deviceStatusSchema,
  inventoryLevelCommandSchema,
  pourCommandSchema,
  primedCommandSchema,
  pumpBindingCommandSchema,
  pumpCalibrationCommandSchema,
  pumpDispenseCommandSchema,
  refillCommandSchema,
} from '@/api/types';
import { DeviceApiError } from '@/lib/device-errors';

const DEVICE_FETCH_TIMEOUT_MS = 8000;
/** Status polls should fail fast when the dispenser moves or is offline. */
const STATUS_FETCH_TIMEOUT_MS = 2500;

function mergeFetchSignal(
  external: AbortSignal | undefined,
  timeoutMs: number,
): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!external) return timeout;

  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([external, timeout]);
  }

  const controller = new AbortController();
  const abort = () => { controller.abort(); };
  external.addEventListener('abort', abort, { once: true });
  timeout.addEventListener('abort', abort, { once: true });
  if (external.aborted || timeout.aborted) abort();
  return controller.signal;
}

async function deviceFetch(
  url: string,
  init?: RequestInit,
  timeoutMs = DEVICE_FETCH_TIMEOUT_MS,
): Promise<Response> {
  return fetch(url, {
    ...init,
    signal: mergeFetchSignal(init?.signal ?? undefined, timeoutMs),
  });
}

async function readErrorBody(
  response: Response,
): Promise<{ message: string; code?: string }> {
  try {
    const body = (await response.json()) as {
      error?: string;
      message?: string;
    };
    const code = body.error;
    const message =
      body.message ??
      (code ? code : undefined) ??
      `Device API ${response.status}`;
    return { message, code };
  } catch {
    return { message: `Device API ${response.status}` };
  }
}

async function throwDeviceError(response: Response): Promise<never> {
  const { message, code } = await readErrorBody(response);
  throw new DeviceApiError(response.status, message, code);
}

async function parseStatusJson(response: Response): Promise<DeviceStatus> {
  if (!response.ok) {
    await throwDeviceError(response);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new DeviceApiError(0, 'Device status response was not valid JSON');
  }

  const parsed = deviceStatusSchema.safeParse(json);
  if (!parsed.success) {
    throw new DeviceApiError(0, 'Device status format invalid');
  }
  const status = parsed.data;
  const job =
    status.job?.state === 'idle' ? null : (status.job ?? null);
  return { ...status, job };
}

/** HTTP client for the ESP32 kiosk device API. */
export class HttpDeviceClient implements DeviceClient {
  private readonly baseUrl?: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl;
  }

  private resolveBaseUrl(): string {
    return this.baseUrl ?? getDeviceApiBase();
  }

  async getStatus(options?: GetStatusOptions): Promise<DeviceStatus> {
    const response = await deviceFetch(
      `${this.resolveBaseUrl()}/status`,
      {
        signal: options?.signal,
      },
      STATUS_FETCH_TIMEOUT_MS,
    );
    return parseStatusJson(response);
  }

  async startPour(command: PourCommand): Promise<void> {
    pourCommandSchema.parse(command);
    const response = await deviceFetch(`${this.resolveBaseUrl()}/pour`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    });
    if (!response.ok) {
      await throwDeviceError(response);
    }
  }

  async cancelPour(): Promise<void> {
    const response = await deviceFetch(`${this.resolveBaseUrl()}/pour/cancel`, {
      method: 'POST',
    });
    if (!response.ok) {
      await throwDeviceError(response);
    }
  }

  async acknowledgePrompt(): Promise<void> {
    const response = await deviceFetch(`${this.resolveBaseUrl()}/pour/ack`, {
      method: 'POST',
    });
    if (!response.ok) {
      await throwDeviceError(response);
    }
  }

  async refillIngredient(command: RefillCommand): Promise<void> {
    refillCommandSchema.parse(command);
    const response = await deviceFetch(`${this.resolveBaseUrl()}/inventory/refill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    });
    if (!response.ok) {
      await throwDeviceError(response);
    }
  }

  async updatePumpBinding(command: PumpBindingCommand): Promise<void> {
    pumpBindingCommandSchema.parse(command);
    const response = await deviceFetch(`${this.resolveBaseUrl()}/pumps/binding`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    });
    if (!response.ok) {
      await throwDeviceError(response);
    }
  }

  async updateBottleSize(command: BottleSizeCommand): Promise<void> {
    bottleSizeCommandSchema.parse(command);
    const response = await deviceFetch(
      `${this.resolveBaseUrl()}/inventory/bottle-size`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(command),
      },
    );
    if (!response.ok) {
      await throwDeviceError(response);
    }
  }

  async updateInventoryLevel(command: InventoryLevelCommand): Promise<void> {
    inventoryLevelCommandSchema.parse(command);
    const response = await deviceFetch(`${this.resolveBaseUrl()}/inventory/level`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    });
    if (!response.ok) {
      await throwDeviceError(response);
    }
  }

  async updatePumpCalibration(command: PumpCalibrationCommand): Promise<void> {
    pumpCalibrationCommandSchema.parse(command);
    const response = await deviceFetch(`${this.resolveBaseUrl()}/pumps/calibration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    });
    if (!response.ok) {
      await throwDeviceError(response);
    }
  }

  async updatePrimed(command: PrimedCommand): Promise<void> {
    primedCommandSchema.parse(command);
    const response = await deviceFetch(`${this.resolveBaseUrl()}/inventory/primed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    });
    if (!response.ok) {
      await throwDeviceError(response);
    }
  }

  async startPumpDispense(command: PumpDispenseCommand): Promise<void> {
    pumpDispenseCommandSchema.parse(command);
    const response = await deviceFetch(`${this.resolveBaseUrl()}/pumps/dispense`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    });
    if (!response.ok) {
      await throwDeviceError(response);
    }
  }

  async cancelPumpDispense(): Promise<void> {
    const response = await deviceFetch(
      `${this.resolveBaseUrl()}/pumps/dispense/cancel`,
      {
        method: 'POST',
      },
    );
    if (!response.ok) {
      await throwDeviceError(response);
    }
  }
}
