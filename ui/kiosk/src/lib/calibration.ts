import {
  DEFAULT_ANTI_DRIP_MS,
  DEFAULT_ML_PER_SECOND,
  MAX_ANTI_DRIP_MS,
  MAX_ML_PER_SECOND,
  MIN_ML_PER_SECOND,
} from '@/api/types';

export const CALIBRATION_SAMPLE_ML = 30;
/** US fluid ounce — 1 standard shot for spirits */
export const SHOT_OZ = 1.5;
export const SHOT_ML = SHOT_OZ * 29.5735;
/** Firmware should auto-stop continuous prime after this (safety). */
export const MAX_PRIME_SECONDS = 60;
export const DEFAULT_CALIBRATION_RUN_SECONDS = 25;
export const VERIFICATION_VOLUMES_ML = [15, 30, 60] as const;

export function formatMlPerSecond(value: number): string {
  return `${value.toFixed(2)} ml/s`;
}

export function estimatePourSeconds(ml: number, mlPerSecond: number): number {
  if (!Number.isFinite(mlPerSecond) || mlPerSecond <= 0) return 0;
  return ml / mlPerSecond;
}

export function clampMlPerSecond(value: number): number {
  return Math.min(MAX_ML_PER_SECOND, Math.max(MIN_ML_PER_SECOND, value));
}

export function clampAntiDripMs(value: number): number {
  return Math.min(MAX_ANTI_DRIP_MS, Math.max(0, Math.round(value)));
}

export function resolvePumpCalibration(pump: {
  mlPerSecond?: number;
  antiDripMs?: number;
}): { mlPerSecond: number; antiDripMs: number } {
  return {
    mlPerSecond: pump.mlPerSecond ?? DEFAULT_ML_PER_SECOND,
    antiDripMs: pump.antiDripMs ?? DEFAULT_ANTI_DRIP_MS,
  };
}

export function computeMlPerSecond(
  outputMl: number,
  durationSeconds: number,
): number | null {
  if (!Number.isFinite(outputMl) || outputMl <= 0) return null;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  return clampMlPerSecond(outputMl / durationSeconds);
}

export type MeasuredFlowRateResult =
  { ok: true; mlPerSecond: number } | { ok: false; error: string };

/** Validates measured calibration output without silently clamping to bounds. */
export function validateMeasuredFlowRate(
  outputMl: number,
  durationSeconds: number,
): MeasuredFlowRateResult {
  if (!Number.isFinite(outputMl) || outputMl <= 0) {
    return { ok: false, error: 'Enter a measured volume greater than 0 ml' };
  }
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return { ok: false, error: 'Invalid calibration run duration' };
  }

  const maxMeasuredMl = MAX_ML_PER_SECOND * durationSeconds;
  if (outputMl > maxMeasuredMl) {
    return {
      ok: false,
      error: `Measured volume is too high for a ${durationSeconds}s run (max ~${Math.round(maxMeasuredMl)} ml)`,
    };
  }

  const mlPerSecond = outputMl / durationSeconds;
  if (mlPerSecond < MIN_ML_PER_SECOND) {
    return {
      ok: false,
      error: `Flow rate would be below ${MIN_ML_PER_SECOND} ml/s — check your measurement`,
    };
  }
  if (mlPerSecond > MAX_ML_PER_SECOND) {
    return {
      ok: false,
      error: `Flow rate would exceed ${MAX_ML_PER_SECOND} ml/s — check your measurement`,
    };
  }

  return { ok: true, mlPerSecond };
}
