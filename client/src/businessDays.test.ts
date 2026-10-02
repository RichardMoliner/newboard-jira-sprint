import { describe, expect, test } from 'vitest';
import { addDays, isBusinessDay, listBusinessDays } from './businessDays.js';

describe('isBusinessDay', () => {
  test('returns true for a weekday with no holiday', () => {
    expect(isBusinessDay('2026-09-01')).toBe(true); // terça-feira
  });

  test('returns false for a Saturday', () => {
    expect(isBusinessDay('2026-09-05')).toBe(false);
  });

  test('returns false for a Sunday', () => {
    expect(isBusinessDay('2026-09-06')).toBe(false);
  });

  test('returns false for a fixed national holiday (Independência, 7 de setembro)', () => {
    expect(isBusinessDay('2026-09-07')).toBe(false);
  });
});

describe('addDays', () => {
  test('advances the date by the given number of days', () => {
    expect(addDays('2026-09-01', 3)).toBe('2026-09-04');
  });

  test('crosses a month boundary', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
  });
});

describe('listBusinessDays', () => {
  test('lists only business days between start and end, inclusive', () => {
    // 2026-09-03 (qui) a 2026-09-08 (ter): pula sábado 05, domingo 06 e o feriado de 07/09.
    expect(listBusinessDays('2026-09-03', '2026-09-08')).toEqual(['2026-09-03', '2026-09-04', '2026-09-08']);
  });

  test('returns a single day when start equals end and it is a business day', () => {
    expect(listBusinessDays('2026-09-01', '2026-09-01')).toEqual(['2026-09-01']);
  });

  test('returns an empty array when the whole range falls on a weekend', () => {
    expect(listBusinessDays('2026-09-05', '2026-09-06')).toEqual([]);
  });
});
