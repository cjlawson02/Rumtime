import { describe, expect, it } from 'vitest';

import type { DeviceStatus } from '@/api/types';
import { collectKioskNotifications } from '@/lib/notifications';

describe('notification href safety', () => {
  it('drops unsafe device action links', () => {
    const status: DeviceStatus = {
      connected: true,
      bindings: {},
      notifications: [
        {
          id: 'evil',
          severity: 'warning',
          title: 'Bad link',
          actionHref: 'javascript:alert(1)',
          actionLabel: 'Open',
        },
        {
          id: 'good',
          severity: 'info',
          title: 'Good link',
          actionHref: '/setup/calibration',
          actionLabel: 'Open tuning',
        },
      ],
      job: null,
    };

    const notifications = collectKioskNotifications({ status });
    const evil = notifications.find((entry) => entry.id === 'device-evil');
    const good = notifications.find((entry) => entry.id === 'device-good');

    expect(evil?.actionHref).toBeUndefined();
    expect(good?.actionHref).toBe('/setup/calibration');
  });
});
