import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ANTI_DRIP_MS,
  DEFAULT_ML_PER_SECOND,
  MAX_ANTI_DRIP_MS,
  MAX_ML_PER_SECOND,
  MIN_ML_PER_SECOND,
} from '@/api/types';
import {
  clampAntiDripMs,
  clampMlPerSecond,
  computeMlPerSecond,
  estimatePourSeconds,
  formatMlPerSecond,
  resolvePumpCalibration,
  validateMeasuredFlowRate,
} from '@/lib/calibration';

describe('calibration helpers', () => {
  it('computes ml per second from a timed run', () => {
    expect(computeMlPerSecond(43.75, 25)).toBeCloseTo(1.75, 2);
  });

  it('returns null for invalid calibration inputs', () => {
    expect(computeMlPerSecond(0, 25)).toBeNull();
    expect(computeMlPerSecond(30, 0)).toBeNull();
  });

  it('validates measured flow rate without silent clamping', () => {
    expect(validateMeasuredFlowRate(43.75, 25)).toEqual({
      ok: true,
      mlPerSecond: 43.75 / 25,
    });
    expect(validateMeasuredFlowRate(9999, 25).ok).toBe(false);
    expect(validateMeasuredFlowRate(0, 25).ok).toBe(false);
  });

  it('formats ml per second for display', () => {
    expect(formatMlPerSecond(1.75)).toBe('1.75 ml/s');
  });

  it('estimates pour duration from volume and flow rate', () => {
    expect(estimatePourSeconds(30, 2)).toBe(15);
    expect(estimatePourSeconds(30, 0)).toBe(0);
  });

  it('clamps ml per second and anti-drip within firmware bounds', () => {
    expect(clampMlPerSecond(MIN_ML_PER_SECOND - 1)).toBe(MIN_ML_PER_SECOND);
    expect(clampMlPerSecond(MAX_ML_PER_SECOND + 1)).toBe(MAX_ML_PER_SECOND);
    expect(clampAntiDripMs(-5)).toBe(0);
    expect(clampAntiDripMs(MAX_ANTI_DRIP_MS + 10)).toBe(MAX_ANTI_DRIP_MS);
  });

  it('fills in default calibration when pump fields are missing', () => {
    expect(resolvePumpCalibration({})).toEqual({
      mlPerSecond: DEFAULT_ML_PER_SECOND,
      antiDripMs: DEFAULT_ANTI_DRIP_MS,
    });
    expect(
      resolvePumpCalibration({ mlPerSecond: 2.5, antiDripMs: 120 }),
    ).toEqual({
      mlPerSecond: 2.5,
      antiDripMs: 120,
    });
  });
});
