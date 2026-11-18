import { describe, expect, test } from 'vitest';
import { groupByAuthor } from './WorklogModal.js';
import type { WorklogEntry } from '../types.js';

function entry(overrides: Partial<WorklogEntry> = {}): WorklogEntry {
  return { subtaskType: 'Implementação', author: 'Fulano', date: '2026-09-10', hours: 2, comment: null, ...overrides };
}

describe('groupByAuthor', () => {
  test('returns empty array for no entries', () => {
    expect(groupByAuthor([])).toEqual([]);
  });

  test('sums hours and keeps all entries for a single author', () => {
    const entries = [entry({ hours: 2, date: '2026-09-10' }), entry({ hours: 3, date: '2026-09-11' })];
    const groups = groupByAuthor(entries);
    expect(groups).toEqual([{ author: 'Fulano', totalHours: 5, entries: [entries[0], entries[1]] }]);
  });

  test('orders authors by total hours descending', () => {
    const entries = [
      entry({ author: 'Pouco', hours: 1 }),
      entry({ author: 'Muito', hours: 3 }),
      entry({ author: 'Muito', hours: 4 }),
    ];
    expect(groupByAuthor(entries).map((g) => g.author)).toEqual(['Muito', 'Pouco']);
  });

  test('sorts each author entries by date ascending, regardless of input order', () => {
    const entries = [
      entry({ author: 'Fulano', date: '2026-09-15', hours: 1 }),
      entry({ author: 'Fulano', date: '2026-09-10', hours: 2 }),
    ];
    const [group] = groupByAuthor(entries);
    expect(group.entries.map((e) => e.date)).toEqual(['2026-09-10', '2026-09-15']);
  });
});
