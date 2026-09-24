import { describe, expect, test } from 'vitest';
import { findSprintEntryDate, type ChangelogHistory } from './fetchSprintEntry.js';

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
