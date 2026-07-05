import { describe, expect, it } from 'vitest';

import type { DeviceStatus, Recipe } from '@/api/types';
import { partitionMenuRecipes } from '@/lib/availability';
import {
  collectKioskNotifications,
  notificationCenterSummary,
} from '@/lib/notifications';

describe('notifications', () => {
  it('merges menu and device alerts into one feed', () => {
    const stocked: Recipe = {
      id: 'stocked',
      name: 'Stocked drink',
      categories: ['gin'],
      description: 'Ready to pour',
      ingredients: [{ id: 'gin', name: 'Gin', ml: 30, kind: 'pumped' }],
    };
    const low: Recipe = {
      id: 'low',
      name: 'Low drink',
      categories: ['rum'],
      description: 'Low inventory',
      ingredients: [{ id: 'rum', name: 'White rum', ml: 45, kind: 'pumped' }],
    };
    const unbound: Recipe = {
      id: 'unbound',
      name: 'Unbound drink',
      categories: ['vodka'],
      description: 'Missing line',
      ingredients: [{ id: 'vodka', name: 'Vodka', ml: 45, kind: 'pumped' }],
    };
    const menuDevice: DeviceStatus = {
      connected: true,
      bindings: {
        gin: {
          ingredientId: 'gin',
          remainingMl: 500,
          bottleSizeMl: 750,
          primed: true,
        },
        rum: {
          ingredientId: 'rum',
          remainingMl: 12,
          bottleSizeMl: 750,
          primed: true,
        },
      },
      pumps: [
        { pumpId: 1, ingredientId: 'gin' },
        { pumpId: 2, ingredientId: 'rum' },
      ],
      notifications: [
        {
          id: 'scale_not_ready',
          severity: 'warning',
          title: 'Scale not ready',
          message: 'Place an empty glass on the platform.',
        },
      ],
      job: null,
    };

    const { unavailable } = partitionMenuRecipes(
      [stocked, low, unbound],
      menuDevice,
    );
    const notifications = collectKioskNotifications({
      status: menuDevice,
      unavailableRecipes: unavailable,
    });

    expect(notifications).toHaveLength(3);
    expect(
      notifications.find((entry) => entry.source === 'device')?.title,
    ).toBe('Scale not ready');
    expect(
      notifications.some((entry) => entry.id === 'menu-unbound-vodka'),
    ).toBe(true);
    expect(
      notifications.some((entry) => entry.id === 'menu-low_inventory-rum'),
    ).toBe(true);
    expect(
      notifications.find((entry) => entry.id === 'menu-unbound-vodka')?.detail,
    ).toContain('Unbound drink');
    expect(notificationCenterSummary(notifications)).toContain(
      '1 alert from the dispenser',
    );
  });

  it('sorts unprimed menu alerts ahead of low inventory', () => {
    const unprimed: Recipe = {
      id: 'unprimed',
      name: 'Unprimed drink',
      categories: ['gin'],
      description: 'Needs prime',
      ingredients: [{ id: 'gin', name: 'Gin', ml: 30, kind: 'pumped' }],
    };
    const device: DeviceStatus = {
      connected: true,
      bindings: {
        gin: {
          ingredientId: 'gin',
          remainingMl: 500,
          bottleSizeMl: 750,
          primed: false,
        },
      },
      pumps: [{ pumpId: 1, ingredientId: 'gin' }],
    };
    const { unavailable } = partitionMenuRecipes([unprimed], device);
    const notifications = collectKioskNotifications({
      status: device,
      unavailableRecipes: unavailable,
    });

    expect(notifications[0]?.id).toBe('menu-unprimed-gin');
    expect(notifications[0]?.title).toMatch(/not primed/i);
    expect(notifications[0]?.actionLabel).toBe('Open bottle bay');
  });

  it('summarizes menu-only alerts when there are no device alerts', () => {
    const notifications = collectKioskNotifications({
      status: { connected: true, bindings: {} },
      unavailableRecipes: [],
    });
    expect(notificationCenterSummary(notifications)).toBe('0 alerts');
  });

  it('sanitizes unsafe device action links', () => {
    const notifications = collectKioskNotifications({
      status: {
        connected: true,
        bindings: {},
        notifications: [
          {
            id: 'bad_link',
            severity: 'info',
            title: 'Check setup',
            message: 'Open setup',
            actionHref: 'https://evil.example',
            actionLabel: 'Open',
          },
        ],
      },
    });

    expect(notifications[0]?.actionHref).toBeUndefined();
  });
});
