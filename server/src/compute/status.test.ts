import { describe, expect, test } from 'vitest';
import { isCarried, isOverdue, isDeliveredOnTime } from './status.js';

describe('isCarried', () => {
  test('true when real start is before sprint start', () => {
    expect(isCarried('2026-08-24', '2026-09-03')).toBe(true);
  });

  test('false when real start is the same as sprint start', () => {
    expect(isCarried('2026-09-03', '2026-09-03')).toBe(false);
  });

  test('false when real start is after sprint start', () => {
    expect(isCarried('2026-09-04', '2026-09-03')).toBe(false);
  });
});

describe('isOverdue', () => {
  test('true when due date is in the past and activity is not done', () => {
    expect(isOverdue('2026-09-04', false, '2026-09-08')).toBe(true);
  });

  test('false when due date is in the past but activity is done', () => {
    expect(isOverdue('2026-09-04', true, '2026-09-08')).toBe(false);
  });

  test('false when due date is today', () => {
    expect(isOverdue('2026-09-08', false, '2026-09-08')).toBe(false);
  });

  test('false when due date is in the future', () => {
    expect(isOverdue('2026-09-10', false, '2026-09-08')).toBe(false);
  });

  test('false when there is no due date', () => {
    expect(isOverdue(null, false, '2026-09-08')).toBe(false);
  });
});

describe('isDeliveredOnTime', () => {
  test('true when delivered before the due date', () => {
    expect(isDeliveredOnTime('2026-09-04', '2026-09-08')).toBe(true);
  });

  test('true when delivered exactly on the due date', () => {
    expect(isDeliveredOnTime('2026-09-08', '2026-09-08')).toBe(true);
  });

  test('false when delivered after the due date', () => {
    expect(isDeliveredOnTime('2026-09-10', '2026-09-08')).toBe(false);
  });

  test('null when there is no delivered date', () => {
    expect(isDeliveredOnTime(null, '2026-09-08')).toBeNull();
  });

  test('null when there is no due date to compare against', () => {
    expect(isDeliveredOnTime('2026-09-08', null)).toBeNull();
  });
});
