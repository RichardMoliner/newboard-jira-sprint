import { describe, expect, test } from 'vitest';
import { latestOrNull } from './fetchImplCodeReviewDate.js';

// `findStatusEnteredDate` mudou de dono — é uma função genérica (não específica de code review),
// agora mora em `fetchSprintEntry.ts` junto das outras funções que extraem fatos do changelog;
// seus testes foram pra `fetchSprintEntry.test.ts`.

describe('latestOrNull', () => {
  test('returns null when every date is null (no subtask ever reached the status)', () => {
    expect(latestOrNull([null, null])).toBeNull();
  });

  test('returns the only non-null date when a single subtask reached it', () => {
    expect(latestOrNull([null, '2026-09-10'])).toBe('2026-09-10');
  });

  test('returns the LATEST date when more than one subtask reached it (code review only "complete" once the last one gets there)', () => {
    expect(latestOrNull(['2026-09-10', '2026-09-15', '2026-09-08'])).toBe('2026-09-15');
  });

  test('returns null for an empty list', () => {
    expect(latestOrNull([])).toBeNull();
  });
});
