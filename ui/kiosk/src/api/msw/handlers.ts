import { http, HttpResponse } from 'msw';

import { DEVICE_API_BASE } from '@/api/device-client';
import {
  getMockDeviceStatus,
  mockDeviceClient,
  resetMockDevice,
} from '@/api/mock-device';
import {
  bottleSizeCommandSchema,
  inventoryLevelCommandSchema,
  pourCommandSchema,
  primedCommandSchema,
  pumpBindingCommandSchema,
  pumpCalibrationCommandSchema,
  pumpDispenseCommandSchema,
  refillCommandSchema,
} from '@/api/types';

const base = DEVICE_API_BASE.replace(/\/$/, '');

export const deviceHandlers = [
  http.get(`${base}/status`, () => {
    return HttpResponse.json(getMockDeviceStatus());
  }),

  http.post(`${base}/pour`, async ({ request }) => {
    try {
      const body = pourCommandSchema.parse(await request.json());
      await mockDeviceClient.startPour(body);
      return new HttpResponse(null, { status: 204 });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'pour failed';
      if (message.startsWith('409')) {
        return HttpResponse.json({ error: 'busy' }, { status: 409 });
      }
      if (message.startsWith('404')) {
        return HttpResponse.json({ error: 'not_found' }, { status: 404 });
      }
      if (message.startsWith('422')) {
        const code = message.includes('primed')
          ? 'not_primed'
          : message.includes('inventory')
            ? 'low_inventory'
            : message.includes('unassigned')
              ? 'unassigned'
              : 'unprocessable';
        return HttpResponse.json({ error: code, message }, { status: 422 });
      }
      return HttpResponse.json({ error: message }, { status: 400 });
    }
  }),

  http.post(`${base}/pour/cancel`, async () => {
    await mockDeviceClient.cancelPour();
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${base}/pour/ack`, async () => {
    await mockDeviceClient.acknowledgePrompt();
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${base}/inventory/refill`, async ({ request }) => {
    try {
      const body = refillCommandSchema.parse(await request.json());
      await mockDeviceClient.refillIngredient(body);
      return new HttpResponse(null, { status: 204 });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'refill failed';
      if (message.startsWith('404')) {
        return HttpResponse.json({ error: 'not bound' }, { status: 404 });
      }
      return HttpResponse.json({ error: message }, { status: 400 });
    }
  }),

  http.post(`${base}/pumps/binding`, async ({ request }) => {
    try {
      const body = pumpBindingCommandSchema.parse(await request.json());
      await mockDeviceClient.updatePumpBinding(body);
      return new HttpResponse(null, { status: 204 });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'binding failed';
      if (message.startsWith('404')) {
        return HttpResponse.json({ error: 'not found' }, { status: 404 });
      }
      return HttpResponse.json({ error: message }, { status: 400 });
    }
  }),

  http.post(`${base}/inventory/bottle-size`, async ({ request }) => {
    try {
      const body = bottleSizeCommandSchema.parse(await request.json());
      await mockDeviceClient.updateBottleSize(body);
      return new HttpResponse(null, { status: 204 });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'bottle size failed';
      if (message.startsWith('404')) {
        return HttpResponse.json({ error: 'not bound' }, { status: 404 });
      }
      return HttpResponse.json({ error: message }, { status: 400 });
    }
  }),

  http.post(`${base}/inventory/level`, async ({ request }) => {
    try {
      const body = inventoryLevelCommandSchema.parse(await request.json());
      await mockDeviceClient.updateInventoryLevel(body);
      return new HttpResponse(null, { status: 204 });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'fill level failed';
      if (message.startsWith('404')) {
        return HttpResponse.json({ error: 'not bound' }, { status: 404 });
      }
      return HttpResponse.json({ error: message }, { status: 400 });
    }
  }),

  http.post(`${base}/pumps/calibration`, async ({ request }) => {
    try {
      const body = pumpCalibrationCommandSchema.parse(await request.json());
      await mockDeviceClient.updatePumpCalibration(body);
      return new HttpResponse(null, { status: 204 });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'calibration failed';
      if (message.startsWith('404')) {
        return HttpResponse.json({ error: 'not found' }, { status: 404 });
      }
      return HttpResponse.json({ error: message }, { status: 400 });
    }
  }),

  http.post(`${base}/inventory/primed`, async ({ request }) => {
    try {
      const body = primedCommandSchema.parse(await request.json());
      await mockDeviceClient.updatePrimed(body);
      return new HttpResponse(null, { status: 204 });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'primed failed';
      if (message.startsWith('404')) {
        return HttpResponse.json({ error: 'not bound' }, { status: 404 });
      }
      return HttpResponse.json({ error: message }, { status: 400 });
    }
  }),

  http.post(`${base}/pumps/dispense`, async ({ request }) => {
    try {
      const body = pumpDispenseCommandSchema.parse(await request.json());
      await mockDeviceClient.startPumpDispense(body);
      return new HttpResponse(null, { status: 204 });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'dispense failed';
      if (message.startsWith('409')) {
        return HttpResponse.json({ error: 'busy' }, { status: 409 });
      }
      if (message.startsWith('404')) {
        return HttpResponse.json({ error: 'not found' }, { status: 404 });
      }
      if (message.startsWith('422')) {
        const code = message.includes('primed')
          ? 'not_primed'
          : message.includes('unassigned')
            ? 'unassigned'
            : 'unprocessable';
        return HttpResponse.json({ error: code, message }, { status: 422 });
      }
      return HttpResponse.json({ error: message }, { status: 400 });
    }
  }),

  http.post(`${base}/pumps/dispense/cancel`, async () => {
    await mockDeviceClient.cancelPumpDispense();
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${base}/mock/reset`, () => {
    resetMockDevice();
    return new HttpResponse(null, { status: 204 });
  }),
];
