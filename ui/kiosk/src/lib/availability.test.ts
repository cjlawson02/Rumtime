import { describe, expect, it } from 'vitest';

import type { DeviceStatus, Recipe } from '@/api/types';
import {
  canShowRefillCta,
  effectiveBlockingIssues,
  firstBlockingMessage,
  getDrinkAvailability,
  hasUnboundIssues,
  isPourBlocked,
  issueLabel,
  issueStatusChipLabel,
  partitionMenuRecipes,
  refillButtonLabel,
} from '@/lib/availability';

const recipe: Recipe = {
  id: 'test',
  name: 'Test',
  categories: ['rum'],
  description: 'Test drink',
  ingredients: [
    { id: 'rum', name: 'White rum', ml: 45, kind: 'pumped' },
    { id: 'lime', name: 'Lime', ml: 20, kind: 'manual' },
  ],
};

const device: DeviceStatus = {
  connected: true,
  bindings: {
    rum: {
      ingredientId: 'rum',
      remainingMl: 12,
      bottleSizeMl: 750,
      primed: true,
    },
  },
  job: null,
};

describe('availability', () => {
  it('shows refill CTA only when low inventory is the sole pump blocker', () => {
    const lowOnly = getDrinkAvailability(recipe, device);
    const lowBlocking = lowOnly.issues;
    expect(canShowRefillCta(lowBlocking)).toBe(true);
    expect(refillButtonLabel(lowBlocking)).toBe('Refill White rum');

    const unboundDevice: DeviceStatus = {
      ...device,
      bindings: {},
    };
    const mixed = getDrinkAvailability(recipe, unboundDevice);
    const mixedBlocking = mixed.issues;
    expect(hasUnboundIssues(mixedBlocking)).toBe(true);
    expect(canShowRefillCta(mixedBlocking)).toBe(false);
  });

  it('bypasses only low inventory when pouring anyway', () => {
    const issues = getDrinkAvailability(recipe, device).issues;
    expect(effectiveBlockingIssues(issues, false)).toHaveLength(1);
    expect(effectiveBlockingIssues(issues, true)).toHaveLength(0);
  });

  it('reports the first blocking message for silent pour failures', () => {
    const issues = getDrinkAvailability(recipe, device).issues;
    expect(firstBlockingMessage(issues)).toMatch(/low|not connected/i);
  });

  it('blocks pours when the line is not primed', () => {
    const unprimedDevice: DeviceStatus = {
      ...device,
      bindings: {
        rum: {
          ingredientId: 'rum',
          remainingMl: 500,
          bottleSizeMl: 750,
          primed: false,
        },
      },
      pumps: [{ pumpId: 1, ingredientId: 'rum' }],
    };
    const availability = getDrinkAvailability(recipe, unprimedDevice);
    expect(availability.available).toBe(false);
    expect(firstBlockingMessage(availability.issues)).toMatch(/primed/i);
  });

  it('treats empty pump list as unbound when bindings exist', () => {
    const noPumps: DeviceStatus = {
      ...device,
      bindings: {
        rum: {
          ingredientId: 'rum',
          remainingMl: 500,
          bottleSizeMl: 750,
          primed: true,
        },
      },
      pumps: [],
    };
    const availability = getDrinkAvailability(recipe, noPumps);
    expect(availability.available).toBe(true);
  });

  it('blocks when primed is omitted', () => {
    const unprimedDevice: DeviceStatus = {
      ...device,
      bindings: {
        rum: {
          ingredientId: 'rum',
          remainingMl: 500,
          bottleSizeMl: 750,
        },
      },
      pumps: [{ pumpId: 1, ingredientId: 'rum' }],
    };
    const availability = getDrinkAvailability(recipe, unprimedDevice);
    expect(availability.available).toBe(false);
    expect(availability.issues[0]?.type).toBe('unprimed');
  });

  it('does not block availability for manual ingredients', () => {
    const stockedDevice: DeviceStatus = {
      ...device,
      bindings: {
        rum: {
          ingredientId: 'rum',
          remainingMl: 500,
          bottleSizeMl: 750,
          primed: true,
        },
      },
    };
    const availability = getDrinkAvailability(recipe, stockedDevice);
    expect(availability.manualItems).toHaveLength(1);
    expect(availability.available).toBe(true);
    expect(availability.issues).toHaveLength(0);
  });

  it('labels issues for menu chips and blocking messages', () => {
    const issues = getDrinkAvailability(recipe, device).issues;
    expect(isPourBlocked(issues)).toBe(true);
    expect(issueLabel(issues[0]!)).toMatch(/White rum/);
    expect(issueStatusChipLabel(issues[0]!)).toBe('Needs refill');
  });

  it('partitions menu recipes into available and unavailable buckets', () => {
    const manualOnly: Recipe = {
      id: 'manual-only',
      name: 'Manual only',
      categories: ['rum'],
      description: 'No pumps',
      ingredients: [{ id: 'lime', name: 'Lime', kind: 'manual' }],
    };
    const { available, unavailable } = partitionMenuRecipes(
      [recipe, manualOnly],
      device,
    );
    expect(available.map((r) => r.id)).toEqual(['manual-only']);
    expect(unavailable.map((entry) => entry.recipe.id)).toEqual(['test']);
    expect(unavailable[0]?.availability.issues[0]?.type).toBe('low_inventory');
  });
});
