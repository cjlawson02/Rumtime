import { describe, expect, it } from 'vitest';

import type { PourJob } from '@/api/types';
import { isActivePourJob, isTerminalPourJob } from '@/lib/pour-job';

const baseJob = {
  recipeId: 'old-fashioned',
  progress: 50,
  stepLabel: 'Pouring rum',
} satisfies Omit<PourJob, 'state'>;

describe('isActivePourJob', () => {
  it('treats pouring and prompt as active', () => {
    expect(isActivePourJob({ ...baseJob, state: 'pouring' })).toBe(true);
    expect(isActivePourJob({ ...baseJob, state: 'prompt' })).toBe(true);
  });

  it('treats idle, complete, and cancelled as inactive', () => {
    expect(isActivePourJob({ ...baseJob, state: 'idle' })).toBe(false);
    expect(isActivePourJob({ ...baseJob, state: 'complete' })).toBe(false);
    expect(isActivePourJob({ ...baseJob, state: 'cancelled' })).toBe(false);
  });
});

describe('isTerminalPourJob', () => {
  it('treats complete, cancelled, and idle as terminal', () => {
    expect(isTerminalPourJob({ ...baseJob, state: 'complete' })).toBe(true);
    expect(isTerminalPourJob({ ...baseJob, state: 'cancelled' })).toBe(true);
    expect(isTerminalPourJob({ ...baseJob, state: 'idle' })).toBe(true);
  });

  it('treats pouring and prompt as non-terminal', () => {
    expect(isTerminalPourJob({ ...baseJob, state: 'pouring' })).toBe(false);
    expect(isTerminalPourJob({ ...baseJob, state: 'prompt' })).toBe(false);
  });
});
