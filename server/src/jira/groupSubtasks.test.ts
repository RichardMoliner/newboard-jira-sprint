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
});
