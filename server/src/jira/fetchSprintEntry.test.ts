import { describe, expect, test } from 'vitest';
import { findSprintEntryDate, findDoneTransitionDate, findStatusEnteredDate, type ChangelogHistory } from './fetchSprintEntry.js';

function history(overrides: Partial<ChangelogHistory> = {}): ChangelogHistory {
  return {
    created: '2026-09-22T10:22:37.819-0300',
    items: [{ field: 'Sprint', to: '7659', toString: 'FROT Editais PM Jaraguá' }],
    ...overrides,
  };
}

describe('findSprintEntryDate', () => {
  test('returns null when there is no changelog history at all', () => {
    expect(findSprintEntryDate([], '7659')).toBeNull();
  });

  test('returns null when no history item touches the Sprint field', () => {
    const histories = [history({ items: [{ field: 'status', toString: 'Em andamento' }] })];
    expect(findSprintEntryDate(histories, '7659')).toBeNull();
  });

  test('finds the real-world FROT-7964 case: single Sprint change from null into the current sprint', () => {
    const histories = [
      history({ created: '2026-09-22T10:22:37.819-0300', items: [{ field: 'Sprint', to: '7659', toString: 'FROT Editais PM Jaraguá' }] }),
    ];
    expect(findSprintEntryDate(histories, '7659')).toBe('2026-09-22T10:22:37.819-0300');
  });

  test('ignores Sprint changes that do not move the issue into the target sprint ID', () => {
    const histories = [history({ items: [{ field: 'Sprint', to: '9999', toString: 'Outra Sprint' }] })];
    expect(findSprintEntryDate(histories, '7659')).toBeNull();
  });

  test('matches when `to` lists multiple sprint IDs, comma-separated (multi-value field change)', () => {
    const histories = [history({ items: [{ field: 'Sprint', to: '1234, 7659', toString: 'Sprint Antiga, FROT Editais PM Jaraguá' }] })];
    expect(findSprintEntryDate(histories, '7659')).toBe('2026-09-22T10:22:37.819-0300');
  });

  test('picks the most recent matching entry by `created`, regardless of array order', () => {
    const histories = [
      history({ created: '2026-09-25T09:00:00.000-0300', items: [{ field: 'Sprint', to: '7659', toString: 'FROT Editais PM Jaraguá' }] }),
      history({ created: '2026-09-22T10:22:37.819-0300', items: [{ field: 'Sprint', to: '7659', toString: 'FROT Editais PM Jaraguá' }] }),
    ];
    expect(findSprintEntryDate(histories, '7659')).toBe('2026-09-25T09:00:00.000-0300');
  });

  test('ignores a later Sprint change that moved the issue OUT of the target sprint', () => {
    const histories = [
      history({ created: '2026-09-22T10:22:37.819-0300', items: [{ field: 'Sprint', to: '7659', toString: 'FROT Editais PM Jaraguá' }] }),
      history({ created: '2026-09-23T08:00:00.000-0300', items: [{ field: 'Sprint', to: '9999', toString: 'Outra Sprint' }] }),
    ];
    expect(findSprintEntryDate(histories, '7659')).toBe('2026-09-22T10:22:37.819-0300');
  });

  test('does not crash when `to` is null and ignores that item', () => {
    const histories = [history({ items: [{ field: 'Sprint', to: null, toString: null }] })];
    expect(findSprintEntryDate(histories, '7659')).toBeNull();
  });

  test('real case: COM-34961 — matches by sprint ID even when the sprint was RENAMED after the changelog entry was recorded (toString still shows the old name, but `to` has the stable ID)', () => {
    const histories = [
      history({
        created: '2026-10-29T06:04:13.532-0300',
        items: [{ field: 'Sprint', to: '7659', toString: 'Planning extensões (mês 11)' }],
      }),
    ];
    // "COM - S11 - Extensões" é o nome ATUAL da sprint 7659 — não aparece em nenhum toString do
    // changelog, só o nome antigo (antes do rename) aparece. Match por nome falharia aqui.
    expect(findSprintEntryDate(histories, '7659')).toBe('2026-10-29T06:04:13.532-0300');
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
    expect(findStatusEnteredDate(histories, 'Aguardando liberação para testes')).toBe('2026-09-10');
  });

  test('picks the FIRST occurrence by `created`, not the most recent (reopened review)', () => {
    const histories: ChangelogHistory[] = [
      { created: '2026-09-12T09:00:00.000-0300', items: [{ field: 'status', toString: 'Aguardando liberação para testes' }] },
      { created: '2026-09-10T09:00:00.000-0300', items: [{ field: 'status', toString: 'Aguardando liberação para testes' }] },
    ];
    expect(findStatusEnteredDate(histories, 'Aguardando liberação para testes')).toBe('2026-09-10');
  });

  test('truncates the matched timestamp to YYYY-MM-DD', () => {
    const histories: ChangelogHistory[] = [
      { created: '2026-09-05T09:00:00.000-0300', items: [{ field: 'status', toString: 'Aguardando liberação para testes' }] },
    ];
    expect(findStatusEnteredDate(histories, 'Aguardando liberação para testes')).toBe('2026-09-05');
  });

  test('also works for a status other than code review (e.g. "Em andamento", used for status-history\'s first phase boundary)', () => {
    const histories: ChangelogHistory[] = [
      { created: '2026-09-03T08:00:00.000-0300', items: [{ field: 'status', toString: 'Em andamento' }] },
    ];
    expect(findStatusEnteredDate(histories, 'Em andamento')).toBe('2026-09-03');
  });
});
