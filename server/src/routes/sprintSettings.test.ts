import { describe, expect, test } from 'vitest';
import { parseOptionalPositiveNumberField, parseOptionalSprintGroupField } from './sprintSettings.js';

describe('parseOptionalPositiveNumberField', () => {
  test('keeps the current value when the field is absent from the body', () => {
    expect(parseOptionalPositiveNumberField(undefined, 6)).toEqual({ value: 6 });
  });

  test('clears the value to null when an empty string is sent', () => {
    expect(parseOptionalPositiveNumberField('', 6)).toEqual({ value: null });
  });

  test('clears the value to null when null is sent', () => {
    expect(parseOptionalPositiveNumberField(null, 6)).toEqual({ value: null });
  });

  test('accepts a valid positive number', () => {
    expect(parseOptionalPositiveNumberField(5.71, null)).toEqual({ value: 5.71 });
  });

  test('accepts a numeric string', () => {
    expect(parseOptionalPositiveNumberField('5.71', null)).toEqual({ value: 5.71 });
  });

  test('rejects zero, keeping the current value and surfacing an error', () => {
    expect(parseOptionalPositiveNumberField(0, 6)).toEqual({
      value: 6,
      error: 'deve ser um número maior que zero.',
    });
  });

  test('rejects a negative number', () => {
    expect(parseOptionalPositiveNumberField(-1, 6)).toEqual({
      value: 6,
      error: 'deve ser um número maior que zero.',
    });
  });

  test('rejects a non-numeric string', () => {
    expect(parseOptionalPositiveNumberField('abc', 6)).toEqual({
      value: 6,
      error: 'deve ser um número maior que zero.',
    });
  });
});

describe('parseOptionalSprintGroupField', () => {
  test('keeps the current value when the field is absent from the body', () => {
    expect(parseOptionalSprintGroupField(undefined, 'aplicacao')).toEqual({ value: 'aplicacao' });
  });

  test('clears to null (sem grupo) when an empty string is sent', () => {
    expect(parseOptionalSprintGroupField('', 'aplicacao')).toEqual({ value: null });
  });

  test('clears to null when null is sent', () => {
    expect(parseOptionalSprintGroupField(null, 'aplicacao')).toEqual({ value: null });
  });

  test('accepts "aplicacao"', () => {
    expect(parseOptionalSprintGroupField('aplicacao', null)).toEqual({ value: 'aplicacao' });
  });

  test('accepts "extensao"', () => {
    expect(parseOptionalSprintGroupField('extensao', null)).toEqual({ value: 'extensao' });
  });

  test('rejects an unknown value, keeping the current value and surfacing an error', () => {
    expect(parseOptionalSprintGroupField('outro', 'aplicacao')).toEqual({
      value: 'aplicacao',
      error: 'deve ser um dos valores: aplicacao, extensao.',
    });
  });
});
