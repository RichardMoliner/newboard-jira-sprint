import { describe, expect, test } from 'vitest';
import { isBusinessDay, addBusinessDays, businessDaysBetween } from './businessDays.js';

describe('isBusinessDay', () => {
  test('returns true for a regular weekday', () => {
    expect(isBusinessDay('2026-09-04')).toBe(true); // Friday
  });

  test('returns false for a Saturday', () => {
    expect(isBusinessDay('2026-09-05')).toBe(false);
  });

  test('returns false for a Sunday', () => {
    expect(isBusinessDay('2026-09-06')).toBe(false);
  });

  test('returns false for a fixed national holiday (Independência, 07/09)', () => {
    expect(isBusinessDay('2026-09-07')).toBe(false);
  });

  test('returns false for New Year\'s Day', () => {
    expect(isBusinessDay('2026-01-01')).toBe(false);
  });

  test('returns false for Christmas', () => {
    expect(isBusinessDay('2026-12-25')).toBe(false);
  });
});

describe('addBusinessDays', () => {
  test('adding 0 business days returns the same date', () => {
    expect(addBusinessDays('2026-09-04', 0)).toBe('2026-09-04');
  });

  test('skips the weekend + holiday of 05-07/09/2026 when moving forward from Friday 04/09', () => {
    // Real case from the original board: 04/09 (Fri) + 1 business day = 08/09 (Tue),
    // because 05-06/09 is a weekend and 07/09 is a national holiday (Independência).
    expect(addBusinessDays('2026-09-04', 1)).toBe('2026-09-08');
  });

  test('matches the real EC-11739 example (15.5 SP): 8 business days from 03/09 lands on 16/09', () => {
    expect(addBusinessDays('2026-09-03', 8)).toBe('2026-09-16');
  });

  test('matches the real EC-11739 example (15.5 SP): 4 more business days from 16/09 lands on 22/09', () => {
    expect(addBusinessDays('2026-09-16', 4)).toBe('2026-09-22');
  });
});

describe('businessDaysBetween', () => {
  test('counts 0 when start and end are the same date', () => {
    expect(businessDaysBetween('2026-09-04', '2026-09-04')).toBe(0);
  });

  test('counts 0 when end is before start', () => {
    expect(businessDaysBetween('2026-09-08', '2026-09-04')).toBe(0);
  });

  test('skips the weekend + holiday of 05-07/09/2026 when counting from Friday 04/09 to Tuesday 08/09', () => {
    expect(businessDaysBetween('2026-09-04', '2026-09-08')).toBe(1);
  });

  test('matches the inverse of addBusinessDays for the real EC-11739 example', () => {
    expect(businessDaysBetween('2026-09-03', '2026-09-16')).toBe(8);
  });
});
