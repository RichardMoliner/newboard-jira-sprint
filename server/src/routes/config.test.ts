import { describe, expect, test } from 'vitest';
import { parseOptionalDateField } from './config.js';

describe('parseOptionalDateField', () => {
  test('keeps the current value when the field is absent from the body', () => {
    expect(parseOptionalDateField(undefined, '2026-09-01')).toEqual({ value: '2026-09-01' });
  });

  test('clears the value when an empty string is sent', () => {
    expect(parseOptionalDateField('', '2026-09-01')).toEqual({ value: null });
  });

  test('accepts a valid YYYY-MM-DD date string', () => {
    expect(parseOptionalDateField('2026-10-05', null)).toEqual({ value: '2026-10-05' });
  });

  test('rejects a malformed date string', () => {
    expect(parseOptionalDateField('05/10/2026', null)).toEqual({
      value: null,
      error: 'deve estar no formato AAAA-MM-DD.',
    });
  });

  test('rejects a non-string value', () => {
    expect(parseOptionalDateField(123, null)).toEqual({
      value: null,
      error: 'deve estar no formato AAAA-MM-DD.',
    });
  });
});
