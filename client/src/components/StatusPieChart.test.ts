import { describe, expect, test } from 'vitest';
import { pieSliceAngles, readableTextColor } from './StatusPieChart.js';

describe('pieSliceAngles', () => {
  test('splits values proportionally into cumulative angles starting at -90deg (12 o\'clock), clockwise', () => {
    const slices = pieSliceAngles([1, 1, 2]);

    expect(slices).toEqual([
      { startAngle: -90, endAngle: 0 },
      { startAngle: 0, endAngle: 90 },
      { startAngle: 90, endAngle: 270 },
    ]);
  });

  test('a single value covering the whole total spans a full circle', () => {
    const slices = pieSliceAngles([5]);
    expect(slices).toEqual([{ startAngle: -90, endAngle: 270 }]);
  });

  test('returns an empty array for an empty input', () => {
    expect(pieSliceAngles([])).toEqual([]);
  });

  test('returns an empty array when every value is zero (no total to divide by)', () => {
    expect(pieSliceAngles([0, 0])).toEqual([]);
  });
});

describe('readableTextColor', () => {
  test('returns dark text for a light fill', () => {
    expect(readableTextColor('#eda100')).toBe('#0b0b0b');
  });

  test('returns white text for a dark fill', () => {
    expect(readableTextColor('#008300')).toBe('#ffffff');
  });
});
