import type { PumpJobPurpose } from '@/api/types';

/** Firmware should auto-stop continuous cleaning runs after this (safety). */
export const MAX_CLEANING_RUN_SECONDS = 120;

/** Bench protocol warm-water flush duration for sticky lines. */
export const TIMED_FLUSH_SECONDS = 60;

/** Star San contact time — follow label; 60 s is a common session default. */
export const SANITIZER_CONTACT_SECONDS = 60;

export const CLEANING_PURPOSES = ['flush', 'sanitize', 'drain'] as const;
export type CleaningPurpose = (typeof CLEANING_PURPOSES)[number];

export type LineCleaningStatus = 'idle' | 'flushed' | 'sanitized' | 'done';

/** Sugary or session-only lines that need extra warm-water flush per doc 07. */
const EXTRA_FLUSH_INGREDIENTS = new Set([
  'simple',
  'grenadine',
  'triple_sec',
  'blue_curacao',
]);

export function needsExtraFlush(ingredientId: string): boolean {
  return EXTRA_FLUSH_INGREDIENTS.has(ingredientId);
}

export function isCleaningPurpose(
  purpose: PumpJobPurpose,
): purpose is CleaningPurpose {
  return (CLEANING_PURPOSES as readonly string[]).includes(purpose);
}

export function isContinuousDispensePurpose(purpose: PumpJobPurpose): boolean {
  return (
    purpose === 'prime' ||
    purpose === 'flush' ||
    purpose === 'sanitize' ||
    purpose === 'drain'
  );
}

export function skipsInventoryDeduction(purpose: PumpJobPurpose): boolean {
  return isContinuousDispensePurpose(purpose);
}

export function cleaningPurposeLabel(purpose: CleaningPurpose): string {
  switch (purpose) {
    case 'flush':
      return 'Flushing line…';
    case 'sanitize':
      return 'Running sanitizer…';
    case 'drain':
      return 'Draining line…';
  }
}

export function nextLineCleaningStatus(
  current: LineCleaningStatus,
  phase: 'flush' | 'sanitize' | 'drain' | 'finish',
): LineCleaningStatus {
  if (phase === 'finish') return 'done';
  if (phase === 'drain') return current === 'sanitized' ? 'done' : current;
  if (phase === 'sanitize') return 'sanitized';
  return 'flushed';
}

export function lineCleaningBadgeLabel(status: LineCleaningStatus): string {
  switch (status) {
    case 'idle':
      return 'Not cleaned';
    case 'flushed':
      return 'Flushed';
    case 'sanitized':
      return 'Sanitized';
    case 'done':
      return 'Clean';
  }
}

export function shouldPromptIngredientSwap(
  fromIngredientId: string | null,
  toIngredientId: string | null,
): boolean {
  if (fromIngredientId === toIngredientId) return false;
  return fromIngredientId !== null;
}

export function shouldPromptPrimeAfterAssign(
  fromIngredientId: string | null,
  toIngredientId: string | null,
): boolean {
  return fromIngredientId === null && toIngredientId !== null;
}

export type IngredientSwapCopy = {
  title: string;
  description: string;
  cleanLabel: string;
  saveLabel: string;
};

export function ingredientSwapCopy(
  pumpId: number,
  fromIngredientId: string | null,
  toIngredientId: string | null,
  nameFor: (id: string) => string,
): IngredientSwapCopy | null {
  if (!shouldPromptIngredientSwap(fromIngredientId, toIngredientId)) {
    return null;
  }

  if (!toIngredientId) {
    if (!fromIngredientId) return null;
    const oldName = nameFor(fromIngredientId);
    return {
      title: `Clear line ${pumpId}?`,
      description: `${oldName} is on this line. Drain, flush with water, purge dry, then unassign.`,
      cleanLabel: 'Clear line',
      saveLabel: 'Unassign anyway',
    };
  }

  const newName = nameFor(toIngredientId);
  if (!fromIngredientId) return null;
  const oldName = nameFor(fromIngredientId);

  return {
    title: `Swap to ${newName}`,
    description: `Line ${pumpId} was ${oldName}. Drain the old liquid, flush with water, purge dry, then prime ${newName}.`,
    cleanLabel: 'Start swap',
    saveLabel: 'Assign without cleaning',
  };
}
