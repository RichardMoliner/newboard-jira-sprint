import { describe, expect, test } from 'vitest';
import { findStatusEnteredDate, latestOrNull } from './fetchImplCodeReviewDate.js';
import type { ChangelogHistory } from './fetchSprintEntry.js';

describe('findStatusEnteredDate', () => {
  test('returns null when there is no changelog history at all', () => {
    expect(findStatusEnteredDate([], 'Aguardando liberação para testes')).toBeNull();
  });

  test('returns null when no history item touches the status field', () => {
    const histories: ChangelogHistory[] = [
      { created: '2026-09-10T09:00:00.000-0300', items: [{ field: 'Sprint', toString: 'Alguma Sprint' }] },
    ];
    expect(findStatusEnteredDate(histories, 'Aguardando liberação para testes')).toBeNull();
  });

  test('ignores status changes to a different status', () => {
    const histories: ChangelogHistory[] = [
      { created: '2026-09-10T09:00:00.000-0300', items: [{ field: 'status', toString: 'Em andamento' }] },
    ];
    expect(findStatusEnteredDate(histories, 'Aguardando liberação para testes')).toBeNull();
  });

  test('matches case/accent-insensitively, same as groupSubtasks.isAwaitingCodeReviewStatus', () => {
    const histories: ChangelogHistory[] = [
      { created: '2026-09-10T09:00:00.000-0300', items: [{ field: 'status', toString: 'AGUARDANDO LIBERACAO PARA TESTES' }] },
    ];
    expect(findStatusEnteredDate(histories, 'Aguardando liberação para testes')).toBe('2026-09-10T09:00:00.000-0300');
  });

  test('picks the FIRST occurrence by `created`, not the most recent (reopened review)', () => {
    const histories: ChangelogHistory[] = [
      { created: '2026-09-12T09:00:00.000-0300', items: [{ field: 'status', toString: 'Aguardando liberação para testes' }] },
      { created: '2026-09-10T09:00:00.000-0300', items: [{ field: 'status', toString: 'Aguardando liberação para testes' }] },
    ];
    expect(findStatusEnteredDate(histories, 'Aguardando liberação para testes')).toBe('2026-09-10T09:00:00.000-0300');
  });
});

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
