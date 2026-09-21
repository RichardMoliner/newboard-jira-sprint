import { describe, expect, test } from 'vitest';
import { fillTruncatedWorklogs } from './fillTruncatedWorklogs.js';
import type { RawSubtask } from './groupSubtasks.js';

function subtask(overrides: Partial<RawSubtask>): RawSubtask {
  return {
    key: 'EC-1',
    summary: 'Implementação: * Algo',
    status: 'Em andamento',
    type: 'Implementação',
    assignee: 'Fulano',
    created: '2026-08-04T17:43:32.000-0300',
    updated: '2026-09-04T14:17:29.000-0300',
    parent: { key: 'EC-11420' },
    ...overrides,
  };
}

describe('fillTruncatedWorklogs', () => {
  test('leaves a subtask without worklog untouched', async () => {
    const [result] = await fillTruncatedWorklogs([subtask({})], async () => {
      throw new Error('não deveria buscar apontamentos');
    });
    expect(result.worklog).toBeUndefined();
  });

  test('leaves a subtask whose embedded worklog already has every entry untouched', async () => {
    const original = subtask({
      worklog: { worklogs: [{ author: { displayName: 'A' }, started: '2026-09-08T00:00:00.000-0300', timeSpentSeconds: 3600 }], total: 1 },
    });
    const [result] = await fillTruncatedWorklogs([original], async () => {
      throw new Error('não deveria buscar apontamentos');
    });
    expect(result).toBe(original);
  });

  test('fetches the full worklog list when the embedded one was truncated by the search API', async () => {
    const truncated = subtask({
      key: 'COM-67139',
      worklog: {
        worklogs: Array.from({ length: 20 }, (_, i) => ({
          author: { displayName: 'Fulano' },
          started: `2026-09-0${(i % 9) + 1}T00:00:00.000-0300`,
          timeSpentSeconds: 3600,
        })),
        total: 25,
      },
    });
    const fullWorklogs = Array.from({ length: 25 }, (_, i) => ({
      author: { displayName: 'Fulano' },
      started: `2026-09-${String(i + 1).padStart(2, '0')}T00:00:00.000-0300`,
      timeSpentSeconds: 3600,
    }));
    const requested: Array<{ issueKey: string; total: number }> = [];
    const [result] = await fillTruncatedWorklogs([truncated], async (issueKey, total) => {
      requested.push({ issueKey, total });
      return fullWorklogs;
    });

    expect(requested).toEqual([{ issueKey: 'COM-67139', total: 25 }]);
    expect(result.worklog?.worklogs).toEqual(fullWorklogs);
    expect(result.worklog?.worklogs).toHaveLength(25);
  });

  test('only refetches the subtasks that were actually truncated, leaving the rest as-is', async () => {
    const complete = subtask({
      key: 'EC-1',
      worklog: { worklogs: [{ author: { displayName: 'A' }, started: '2026-09-08T00:00:00.000-0300', timeSpentSeconds: 3600 }], total: 1 },
    });
    const truncated = subtask({
      key: 'EC-2',
      worklog: { worklogs: [{ author: { displayName: 'B' }, started: '2026-09-08T00:00:00.000-0300', timeSpentSeconds: 3600 }], total: 2 },
    });
    const requested: string[] = [];
    const result = await fillTruncatedWorklogs([complete, truncated], async (issueKey) => {
      requested.push(issueKey);
      return [
        { author: { displayName: 'B' }, started: '2026-09-08T00:00:00.000-0300', timeSpentSeconds: 3600 },
        { author: { displayName: 'B' }, started: '2026-09-09T00:00:00.000-0300', timeSpentSeconds: 1800 },
      ];
    });

    expect(requested).toEqual(['EC-2']);
    expect(result[0]).toBe(complete);
    expect(result[1].worklog?.worklogs).toHaveLength(2);
  });
});
