import { describe, expect, it } from 'vitest';

import {
  formatRoughOz,
  formatVolumeMl,
  mlToRoughOz,
} from '@/lib/volume';

describe('volume', () => {
  it('converts common pour amounts to rough US fl oz', () => {
    expect(mlToRoughOz(15)).toBe(0.5);
    expect(mlToRoughOz(30)).toBe(1);
    expect(mlToRoughOz(45)).toBe(1.5);
    expect(formatRoughOz(30)).toBe('~1 oz');
    expect(formatVolumeMl(30)).toBe('~1 oz (30 ml)');
    expect(formatVolumeMl(15)).toBe('~0.5 oz (15 ml)');
  });
});
