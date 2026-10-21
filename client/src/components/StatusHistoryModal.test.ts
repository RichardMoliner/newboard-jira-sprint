import { describe, expect, test } from 'vitest';
import { formatDurationDays } from './StatusHistoryModal.js';

describe('formatDurationDays', () => {
  test('pluralizes correctly: 0 dias', () => { expect(formatDurationDays(0)).toBe('0 dias'); });
  test('pluralizes correctly: 1 dia (singular)', () => { expect(formatDurationDays(1)).toBe('1 dia'); });
  test('pluralizes correctly: N dias', () => { expect(formatDurationDays(5)).toBe('5 dias'); });
});
