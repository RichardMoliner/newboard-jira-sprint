import { describe, expect, test } from 'vitest';
import { findSprintEntryDate, findDoneTransitionDate, type ChangelogHistory } from './fetchSprintEntry.js';

function history(overrides: Partial<ChangelogHistory> = {}): ChangelogHistory {
  return {
    created: '2026-09-22T10:22:37.819-0300',
    items: [{ field: 'Sprint', toString: 'FROT Editais PM Jaraguá' }],
    ...overrides,
  };
}

describe('findSprintEntryDate', () => {
  test('returns null when there is no changelog history at all', () => {
    expect(findSprintEntryDate([], 'FROT Editais PM Jaraguá')).toBeNull();
  });

  test('returns null when no history item touches the Sprint field', () => {
    const histories = [history({ items: [{ field: 'status', toString: 'Em andamento' }] })];
    expect(findSprintEntryDate(histories, 'FROT Editais PM Jaraguá')).toBeNull();
  });

  test('finds the real-world FROT-7964 case: single Sprint change from null into the current sprint', () => {
    const histories = [
      history({ created: '2026-09-22T10:22:37.819-0300', items: [{ field: 'Sprint', toString: 'FROT Editais PM Jaraguá' }] }),
    ];
    expect(findSprintEntryDate(histories, 'FROT Editais PM Jaraguá')).toBe('2026-09-22T10:22:37.819-0300');
  });

  test('ignores Sprint changes that do not mention the target sprint name', () => {
    const histories = [history({ items: [{ field: 'Sprint', toString: 'Outra Sprint' }] })];
    expect(findSprintEntryDate(histories, 'FROT Editais PM Jaraguá')).toBeNull();
  });

  test('matches when toString lists multiple sprints (multi-value field change)', () => {
    const histories = [history({ items: [{ field: 'Sprint', toString: 'Sprint Antiga, FROT Editais PM Jaraguá' }] })];
    expect(findSprintEntryDate(histories, 'FROT Editais PM Jaraguá')).toBe('2026-09-22T10:22:37.819-0300');
  });

  test('picks the most recent matching entry by `created`, regardless of array order', () => {
    const histories = [
      history({ created: '2026-09-25T09:00:00.000-0300', items: [{ field: 'Sprint', toString: 'FROT Editais PM Jaraguá' }] }),
      history({ created: '2026-09-22T10:22:37.819-0300', items: [{ field: 'Sprint', toString: 'FROT Editais PM Jaraguá' }] }),
    ];
    expect(findSprintEntryDate(histories, 'FROT Editais PM Jaraguá')).toBe('2026-09-25T09:00:00.000-0300');
  });

  test('ignores a later Sprint change that moved the issue OUT of the target sprint', () => {
    const histories = [
      history({ created: '2026-09-22T10:22:37.819-0300', items: [{ field: 'Sprint', toString: 'FROT Editais PM Jaraguá' }] }),
      history({ created: '2026-09-23T08:00:00.000-0300', items: [{ field: 'Sprint', toString: 'Outra Sprint' }] }),
    ];
    expect(findSprintEntryDate(histories, 'FROT Editais PM Jaraguá')).toBe('2026-09-22T10:22:37.819-0300');
  });

  test('does not crash when toString is null and ignores that item', () => {
    const histories = [history({ items: [{ field: 'Sprint', toString: null }] })];
    expect(findSprintEntryDate(histories, 'FROT Editais PM Jaraguá')).toBeNull();
  });
});

describe('findDoneTransitionDate', () => {
  test('returns null when there is no changelog history at all', () => {
    expect(findDoneTransitionDate([], 'Atendida')).toBeNull();
  });

  test('returns null when no history item touches the status field', () => {
    const histories = [history({ items: [{ field: 'Sprint', toString: 'FROT Editais PM Jaraguá' }] })];
    expect(findDoneTransitionDate(histories, 'Atendida')).toBeNull();
  });

  test('finds the transition into the current (done) status', () => {
    const histories = [
      history({ created: '2026-08-14T11:00:00.000-0300', items: [{ field: 'status', toString: 'Atendida' }] }),
    ];
    expect(findDoneTransitionDate(histories, 'Atendida')).toBe('2026-08-14T11:00:00.000-0300');
  });

  test('ignores status transitions into a different status', () => {
    const histories = [history({ items: [{ field: 'status', toString: 'Em testes' }] })];
    expect(findDoneTransitionDate(histories, 'Atendida')).toBeNull();
  });

  test('picks the most recent transition into the current status, ignoring an earlier reopen/reclose round', () => {
    const histories = [
      history({ created: '2026-08-14T11:00:00.000-0300', items: [{ field: 'status', toString: 'Atendida' }] }),
      history({ created: '2026-08-20T09:00:00.000-0300', items: [{ field: 'status', toString: 'Em andamento' }] }),
      history({ created: '2026-08-25T15:00:00.000-0300', items: [{ field: 'status', toString: 'Atendida' }] }),
    ];
    expect(findDoneTransitionDate(histories, 'Atendida')).toBe('2026-08-25T15:00:00.000-0300');
  });

  test('does not crash when toString is null and ignores that item', () => {
    const histories = [history({ items: [{ field: 'status', toString: null }] })];
    expect(findDoneTransitionDate(histories, 'Atendida')).toBeNull();
  });
});
