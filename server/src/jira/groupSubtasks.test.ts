import { describe, expect, test } from 'vitest';
import { groupSubtasks, type RawSubtask } from './groupSubtasks.js';

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

describe('groupSubtasks', () => {
  test('uses the Implementação subtask created date (date-only) as the start date of its parent', () => {
    const { implStartByParent } = groupSubtasks([subtask({})]);
    expect(implStartByParent.get('EC-11420')).toBe('2026-08-04');
  });

  test('picks the earliest Implementação date when a parent has more than one', () => {
    const { implStartByParent } = groupSubtasks([
      subtask({ key: 'EC-1', created: '2026-08-10T00:00:00.000-0300' }),
      subtask({ key: 'EC-2', created: '2026-08-04T00:00:00.000-0300' }),
    ]);
    expect(implStartByParent.get('EC-11420')).toBe('2026-08-04');
  });

  test('ignores subtasks without a parent', () => {
    const { implStartByParent } = groupSubtasks([subtask({ parent: undefined })]);
    expect(implStartByParent.size).toBe(0);
  });

  test('ignores non-Implementação subtasks for the start date map', () => {
    const { implStartByParent } = groupSubtasks([subtask({ type: 'Requisitos' })]);
    expect(implStartByParent.size).toBe(0);
  });

  test('flags implDoneByParent true when the Implementação subtask is Atendida', () => {
    const { implDoneByParent } = groupSubtasks([subtask({ status: 'Atendida' })]);
    expect(implDoneByParent.get('EC-11420')).toBe(true);
  });

  test('flags implDoneByParent false when the Implementação subtask is not Atendida', () => {
    const { implDoneByParent } = groupSubtasks([subtask({ status: 'Em andamento' })]);
    expect(implDoneByParent.get('EC-11420')).toBe(false);
  });

  test('flags implDoneByParent false when only some of multiple Implementação subtasks are Atendida', () => {
    const { implDoneByParent } = groupSubtasks([
      subtask({ key: 'EC-1', status: 'Atendida' }),
      subtask({ key: 'EC-2', status: 'Em andamento' }),
    ]);
    expect(implDoneByParent.get('EC-11420')).toBe(false);
  });

  test('normalizes "atendida" without accent/case when checking implDoneByParent', () => {
    const { implDoneByParent } = groupSubtasks([subtask({ status: 'ATENDIDA' })]);
    expect(implDoneByParent.get('EC-11420')).toBe(true);
  });

  test('leaves implDoneByParent unset for a parent with no Implementação subtask', () => {
    const { implDoneByParent } = groupSubtasks([subtask({ type: 'Bug' })]);
    expect(implDoneByParent.has('EC-11420')).toBe(false);
  });

  test('groups Bug subtasks under their parent key as BugSubtask entries', () => {
    const { bugsByParent } = groupSubtasks([
      subtask({
        key: 'EC-11983',
        summary: '[Protótipo] Modos de operação',
        status: 'Disponível para testes',
        type: 'Bug',
        assignee: 'Guilherme Mello',
        created: '2026-08-27T15:48:13.000-0300',
        updated: '2026-09-08T14:34:10.000-0300',
        parent: { key: 'EC-11420' },
      }),
    ]);
    expect(bugsByParent.get('EC-11420')).toEqual([
      {
        key: 'EC-11983',
        title: '[Protótipo] Modos de operação',
        developer: 'Guilherme Mello',
        status: 'Disponível para testes',
        startDate: '2026-08-27',
        endDate: '2026-09-08',
      },
    ]);
  });

  test('returns an empty bugs array for a parent with no bugs', () => {
    const { bugsByParent } = groupSubtasks([subtask({ type: 'Implementação' })]);
    expect(bugsByParent.get('EC-11420')).toBeUndefined();
  });

  test('sums worklog hours from the Implementação subtask into implLoggedHoursByParent', () => {
    const { implLoggedHoursByParent } = groupSubtasks([
      subtask({
        worklog: {
          worklogs: [
            { author: { displayName: 'Fulano' }, started: '2026-09-08T16:57:00.000-0300', timeSpentSeconds: 15300 },
          ],
        },
      }),
    ]);
    expect(implLoggedHoursByParent.get('EC-11420')).toBeCloseTo(15300 / 3600);
  });

  test('sums worklog hours across multiple Implementação subtasks of the same parent', () => {
    const { implLoggedHoursByParent } = groupSubtasks([
      subtask({ key: 'EC-1', worklog: { worklogs: [{ author: { displayName: 'A' }, started: '2026-09-08T00:00:00.000-0300', timeSpentSeconds: 3600 }] } }),
      subtask({ key: 'EC-2', worklog: { worklogs: [{ author: { displayName: 'B' }, started: '2026-09-09T00:00:00.000-0300', timeSpentSeconds: 7200 }] } }),
    ]);
    expect(implLoggedHoursByParent.get('EC-11420')).toBeCloseTo(3);
  });

  test('sums worklog hours from the Teste subtask into testLoggedHoursByParent, separately from Implementação', () => {
    const { implLoggedHoursByParent, testLoggedHoursByParent } = groupSubtasks([
      subtask({
        key: 'EC-1',
        type: 'Implementação',
        worklog: { worklogs: [{ author: { displayName: 'A' }, started: '2026-09-08T00:00:00.000-0300', timeSpentSeconds: 3600 }] },
      }),
      subtask({
        key: 'EC-2',
        type: 'Teste',
        worklog: { worklogs: [{ author: { displayName: 'B' }, started: '2026-09-09T00:00:00.000-0300', timeSpentSeconds: 1800 }] },
      }),
    ]);
    expect(implLoggedHoursByParent.get('EC-11420')).toBeCloseTo(1);
    expect(testLoggedHoursByParent.get('EC-11420')).toBeCloseTo(0.5);
  });

  test('leaves implLoggedHoursByParent/testLoggedHoursByParent unset for a parent with no subtasks of that type', () => {
    const { implLoggedHoursByParent, testLoggedHoursByParent } = groupSubtasks([subtask({ type: 'Bug' })]);
    expect(implLoggedHoursByParent.has('EC-11420')).toBe(false);
    expect(testLoggedHoursByParent.has('EC-11420')).toBe(false);
  });

  test('registers 0 logged hours (not unset) for a subtask that exists but has no worklog entries', () => {
    const { implLoggedHoursByParent } = groupSubtasks([subtask({})]);
    expect(implLoggedHoursByParent.get('EC-11420')).toBe(0);
  });

  test('collects worklogEntries from both Implementação and Teste subtasks, sorted by date', () => {
    const { worklogEntriesByParent } = groupSubtasks([
      subtask({
        key: 'EC-1',
        type: 'Implementação',
        worklog: {
          worklogs: [{ author: { displayName: 'Fulano' }, started: '2026-09-09T00:00:00.000-0300', timeSpentSeconds: 3600, comment: 'Impl' }],
        },
      }),
      subtask({
        key: 'EC-2',
        type: 'Teste',
        worklog: {
          worklogs: [{ author: { displayName: 'Ciclana' }, started: '2026-09-08T00:00:00.000-0300', timeSpentSeconds: 1800, comment: 'Teste' }],
        },
      }),
    ]);
    expect(worklogEntriesByParent.get('EC-11420')).toEqual([
      { subtaskType: 'Teste', author: 'Ciclana', date: '2026-09-08', hours: 0.5, comment: 'Teste' },
      { subtaskType: 'Implementação', author: 'Fulano', date: '2026-09-09', hours: 1, comment: 'Impl' },
    ]);
  });

  test('defaults comment to null when a worklog entry has none', () => {
    const { worklogEntriesByParent } = groupSubtasks([
      subtask({ worklog: { worklogs: [{ author: { displayName: 'Fulano' }, started: '2026-09-08T00:00:00.000-0300', timeSpentSeconds: 3600 }] } }),
    ]);
    expect(worklogEntriesByParent.get('EC-11420')?.[0].comment).toBeNull();
  });
});
