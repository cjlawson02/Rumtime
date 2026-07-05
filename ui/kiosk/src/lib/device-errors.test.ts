import { describe, expect, it } from 'vitest';

import {
  DeviceApiError,
  deviceErrorMessage,
  mutationErrorMessage,
  pourErrorMessage,
} from '@/lib/device-errors';

describe('deviceErrorMessage', () => {
  it('maps primed and inventory 422 codes', () => {
    expect(
      deviceErrorMessage(
        new DeviceApiError(422, 'line not primed', 'not_primed'),
      ),
    ).toMatch(/primed/i);
    expect(
      deviceErrorMessage(
        new DeviceApiError(422, 'insufficient inventory', 'low_inventory'),
      ),
    ).toMatch(/liquid/i);
    expect(
      deviceErrorMessage(new DeviceApiError(422, 'unassigned', 'unassigned')),
    ).toMatch(/assigned/i);
  });

  it('maps busy and timeout errors', () => {
    expect(deviceErrorMessage(new DeviceApiError(409, 'busy'))).toMatch(/busy/i);
    const timeout = new Error('timeout');
    timeout.name = 'TimeoutError';
    expect(deviceErrorMessage(timeout)).toMatch(/did not respond/i);
  });
});

describe('pourErrorMessage alias', () => {
  it('matches deviceErrorMessage', () => {
    const err = new DeviceApiError(503, 'unsafe');
    expect(pourErrorMessage(err)).toBe(deviceErrorMessage(err));
  });
});

describe('mutationErrorMessage', () => {
  it('returns Error message when available', () => {
    expect(mutationErrorMessage(new Error('network down'), 'fallback')).toBe(
      'network down',
    );
  });

  it('returns fallback for non-Error values', () => {
    expect(mutationErrorMessage('oops', 'Could not save')).toBe('Could not save');
  });
});
