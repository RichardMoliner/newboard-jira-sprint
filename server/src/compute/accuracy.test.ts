import { describe, expect, test } from 'vitest';
import { computeAccuracyPercent } from './accuracy.js';

describe('computeAccuracyPercent', () => {
  test('returns 100 when estimated and realized hours match exactly', () => {
    expect(computeAccuracyPercent(20, 20)).toBe(100);
  });

  test('returns above 100 when realized took longer than estimated (subestimamos)', () => {
    expect(computeAccuracyPercent(100, 120)).toBe(120);
  });

  test('returns below 100 when realized was faster than estimated (superestimamos)', () => {
    expect(computeAccuracyPercent(100, 80)).toBe(80);
  });

  test('returns 0 when realized hours is zero but estimated is positive', () => {
    expect(computeAccuracyPercent(20, 0)).toBe(0);
  });

  test('returns null when estimated hours is zero or negative', () => {
    expect(computeAccuracyPercent(0, 20)).toBeNull();
  });
});
