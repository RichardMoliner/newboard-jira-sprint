import { describe, expect, test } from 'vitest';
import {
  computeDailyHours,
  computeImplFillEndDate,
  computeOverrunDash,
  computeSprintCompletion,
  computeTestFillRange,
  dayFillRatio,
  formatConsumedPercent,
  formatFullDate,
  formatHoursMinutes,
  formatHoursPair,
  formatStatusBreakdownTooltip,
  groupBugsByArtifact,
  groupBugsByStatus,
  groupDeadlineBadges,
  isDeveloperAvailable,
  isWorkingOnBugs,
  lastWorklogDate,
  matchesLegendFilter,
  projectTestWindow,
  resolveDeadlineRulers,
  type DeadlineRuler,
} from './TimelineView.js';
import type { Activity, BugSubtask, SprintInfo, WorklogEntry } from '../types.js';

function sprintInfo(overrides: Partial<SprintInfo>): SprintInfo {
  return {
    id: 'S1',
    name: 'Sprint 1',
    startDate: '2026-09-01',
    endDate: '2026-09-15',
    startDateTime: '2026-09-01T00:00:00.000-03:00',
    endDateTime: '2026-09-15T23:59:00.000-03:00',
    ...overrides,
  };
}

function entry(overrides: Partial<WorklogEntry>): WorklogEntry {
  return {
    subtaskType: 'Implementação',
    author: 'Fulano',
    date: '2026-09-10',
    hours: 4,
    comment: null,
    ...overrides,
  };
}

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    key: 'EC-1',
    url: 'https://desenv.betha.com.br/browse/EC-1',
    title: 'Atividade',
    sprintId: '7590',
    sprintName: 'ALM S09 2026 Edital',
    isCarried: false,
    developer: 'Fulano',
    tester: 'Ciclana',
    storyPoints: 5,
    startDate: '2026-09-03',
    dueDate: '2026-09-10',
    deliveredDate: null,
    deliveredOnTime: null,
    assertividadePercent: null,
    assertividadeComBugsPercent: null,
    status: 'Em andamento',
    isDone: false,
    isOverdue: false,
    notStarted: false,
    implDone: false,
    implDoneDate: null,
    testDone: false,
    implWindow: null,
    testWindow: null,
    implEstimatedHours: null,
    testEstimatedHours: null,
    implLoggedHours: null,
    testLoggedHours: null,
    bugsLoggedHours: null,
    implBugsLoggedHours: null,
    testBugsLoggedHours: null,
    worklogEntries: [],
    bugs: [],
    addedAfterSprintStart: false,
    sprintEnteredAt: null,
    ...overrides,
  };
}

function bug(overrides: Partial<BugSubtask> = {}): BugSubtask {
  return {
    key: 'EC-1983',
    title: 'Bug de exemplo',
    developer: 'Fulano',
    status: 'Em correção',
    startDate: '2026-08-27',
    endDate: '2026-09-08',
    worklogEntries: [],
    artifact: null,
    labels: [],
    url: 'https://jira.example.com/browse/EC-1983',
    ...overrides,
  };
}

describe('lastWorklogDate', () => {
  test('returns null when there are no entries of the given type', () => {
    const entries = [entry({ subtaskType: 'Teste', date: '2026-09-10' })];
    expect(lastWorklogDate(entries, 'Implementação')).toBeNull();
  });

  test('returns the most recent date among entries of the given type, ignoring other types', () => {
    const entries = [
      entry({ subtaskType: 'Implementação', date: '2026-09-08' }),
      entry({ subtaskType: 'Teste', date: '2026-09-12' }),
      entry({ subtaskType: 'Implementação', date: '2026-09-11' }),
      entry({ subtaskType: 'Bug', date: '2026-09-13' }),
    ];
    expect(lastWorklogDate(entries, 'Implementação')).toBe('2026-09-11');
  });

  test('finds the max date regardless of array order', () => {
    const entries = [
      entry({ subtaskType: 'Implementação', date: '2026-09-05' }),
      entry({ subtaskType: 'Implementação', date: '2026-09-20' }),
      entry({ subtaskType: 'Implementação', date: '2026-09-15' }),
    ];
    expect(lastWorklogDate(entries, 'Implementação')).toBe('2026-09-20');
  });
});

describe('computeImplFillEndDate', () => {
  const implWindow = { start: '2026-09-04', end: '2026-09-14' };

  test('returns null when there is no impl window', () => {
    expect(
      computeImplFillEndDate({
        implWindow: null,
        implPhaseDone: false,
        lastImplWorklogDate: null,
        firstTestWorklogDate: null,
        isDone: false,
        deliveredDate: null,
        today: '2026-09-15',
      }),
    ).toBeNull();
  });

  test('stops at the last real implementation worklog once the phase is done, even if today is later', () => {
    expect(
      computeImplFillEndDate({
        implWindow,
        implPhaseDone: true,
        lastImplWorklogDate: '2026-09-11',
        firstTestWorklogDate: null,
        isDone: false,
        deliveredDate: null,
        today: '2026-09-15',
      }),
    ).toBe('2026-09-11');
  });

  test('falls back to the window start when the phase is done but has no logged worklog', () => {
    expect(
      computeImplFillEndDate({
        implWindow,
        implPhaseDone: true,
        lastImplWorklogDate: null,
        firstTestWorklogDate: null,
        isDone: false,
        deliveredDate: null,
        today: '2026-09-15',
      }),
    ).toBe(implWindow.start);
  });

  test('keeps growing to today while the phase is still in progress', () => {
    expect(
      computeImplFillEndDate({
        implWindow,
        implPhaseDone: false,
        lastImplWorklogDate: null,
        firstTestWorklogDate: null,
        isDone: false,
        deliveredDate: null,
        today: '2026-09-12',
      }),
    ).toBe('2026-09-12');
  });

  test('stops at the first test worklog date when testing already started before the phase is marked done', () => {
    expect(
      computeImplFillEndDate({
        implWindow,
        implPhaseDone: false,
        lastImplWorklogDate: null,
        firstTestWorklogDate: '2026-09-13',
        isDone: false,
        deliveredDate: null,
        today: '2026-09-15',
      }),
    ).toBe('2026-09-13');
  });

  test('never goes earlier than the window start', () => {
    expect(
      computeImplFillEndDate({
        implWindow,
        implPhaseDone: false,
        lastImplWorklogDate: null,
        firstTestWorklogDate: '2026-09-01',
        isDone: false,
        deliveredDate: null,
        today: '2026-09-15',
      }),
    ).toBe(implWindow.start);
  });
});

describe('computeDailyHours', () => {
  test('buckets Implementação and Teste worklog entries by date into their own maps', () => {
    const { implHoursByDate, testHoursByDate } = computeDailyHours(
      activity({
        worklogEntries: [
          entry({ subtaskType: 'Implementação', date: '2026-09-08', hours: 4 }),
          entry({ subtaskType: 'Teste', date: '2026-09-09', hours: 2 }),
        ],
      }),
    );
    expect(implHoursByDate.get('2026-09-08')).toBe(4);
    expect(testHoursByDate.get('2026-09-09')).toBe(2);
  });

  // Apontamentos em bugs agora contam à parte (campo "Bugs (h)"), não entram mais nem em
  // Implementação nem em Teste — nem mesmo os do próprio tester, que antes contavam como Teste.
  test('excludes Bug worklog entries entirely, regardless of who logged them', () => {
    const { implHoursByDate, testHoursByDate } = computeDailyHours(
      activity({
        tester: 'Ciclana',
        worklogEntries: [
          entry({ subtaskType: 'Bug', author: 'Fulano', date: '2026-09-08', hours: 2 }),
          entry({ subtaskType: 'Bug', author: 'Ciclana', date: '2026-09-08', hours: 1.5 }),
        ],
      }),
    );
    expect(implHoursByDate.get('2026-09-08')).toBeUndefined();
    expect(testHoursByDate.get('2026-09-08')).toBeUndefined();
  });

  test('sums multiple entries of the same subtask type on the same date', () => {
    const { implHoursByDate } = computeDailyHours(
      activity({
        worklogEntries: [
          entry({ subtaskType: 'Implementação', author: 'Fulano', date: '2026-09-08', hours: 2 }),
          entry({ subtaskType: 'Implementação', author: 'Beltrano', date: '2026-09-08', hours: 3 }),
        ],
      }),
    );
    expect(implHoursByDate.get('2026-09-08')).toBe(5);
  });
});

describe('formatConsumedPercent', () => {
  test('formats the ratio of logged to estimated hours, rounded, as a percentage', () => {
    expect(formatConsumedPercent(33 + 19 / 60, 45.5)).toBe('73%');
  });

  test('can exceed 100% when more was logged than estimated', () => {
    expect(formatConsumedPercent(50, 40)).toBe('125%');
  });

  test('returns null when nothing was logged yet', () => {
    expect(formatConsumedPercent(null, 45.5)).toBeNull();
  });

  test('returns null when there is no estimate', () => {
    expect(formatConsumedPercent(10, null)).toBeNull();
  });

  test('returns null when the estimate is zero, to avoid dividing by zero', () => {
    expect(formatConsumedPercent(10, 0)).toBeNull();
  });

  test('returns 0% when logged is zero but there is an estimate — live from day one, no need to wait for completion', () => {
    expect(formatConsumedPercent(0, 45.5)).toBe('0%');
  });
});

describe('formatHoursMinutes', () => {
  test('formats a whole number of hours as "Xh"', () => {
    expect(formatHoursMinutes(4)).toBe('4h');
  });

  test('formats a fractional hour as "XhMM"', () => {
    expect(formatHoursMinutes(4.5)).toBe('4h30');
  });

  test('pads minutes below 10 with a leading zero', () => {
    expect(formatHoursMinutes(4 + 5 / 60)).toBe('4h05');
  });
});

describe('formatHoursPair', () => {
  test('formats "apontado / previsto" when both are known', () => {
    expect(formatHoursPair(4, 8)).toBe('4h / 8h');
  });

  test('uses "—" on the logged side when null', () => {
    expect(formatHoursPair(null, 8)).toBe('— / 8h');
  });

  test('uses "—" on the estimated side when null', () => {
    expect(formatHoursPair(4, null)).toBe('4h / —');
  });

  test('returns a single "—" when both sides are null', () => {
    expect(formatHoursPair(null, null)).toBe('—');
  });
});

describe('dayFillRatio', () => {
  test('returns the fraction of the day worked, e.g. 4h logged out of a 6.5h day', () => {
    expect(dayFillRatio(4, 6.5)).toBeCloseTo(4 / 6.5, 10);
  });

  test('returns 0 when nothing was logged', () => {
    expect(dayFillRatio(0, 6.5)).toBe(0);
  });

  test('clamps at 1 when logged hours exceed a full day', () => {
    expect(dayFillRatio(10, 6.5)).toBe(1);
  });

  test('treats a zero-length day as fully worked whenever any hours were logged', () => {
    expect(dayFillRatio(2, 0)).toBe(1);
  });

  test('treats a zero-length day with no hours logged as empty', () => {
    expect(dayFillRatio(0, 0)).toBe(0);
  });
});

describe('projectTestWindow', () => {
  test('returns null when there is no test window', () => {
    expect(projectTestWindow({ testWindow: null, testHasRealProgress: false, implPhaseDone: true, today: '2026-09-15' })).toBeNull();
  });

  test('leaves the window untouched once testing has real progress, even if its start is in the past', () => {
    const testWindow = { start: '2026-09-10', end: '2026-09-11' };
    expect(projectTestWindow({ testWindow, testHasRealProgress: true, implPhaseDone: true, today: '2026-09-15' })).toEqual(testWindow);
  });

  test('leaves the window untouched when its predicted start has not arrived yet', () => {
    const testWindow = { start: '2026-09-17', end: '2026-09-18' };
    expect(projectTestWindow({ testWindow, testHasRealProgress: false, implPhaseDone: true, today: '2026-09-15' })).toEqual(testWindow);
  });

  test('projects the window to start today (a business day) when implementation is already done and testing has not started', () => {
    const testWindow = { start: '2026-09-10', end: '2026-09-11' };
    expect(projectTestWindow({ testWindow, testHasRealProgress: false, implPhaseDone: true, today: '2026-09-15' })).toEqual({
      start: '2026-09-15',
      end: '2026-09-16',
    });
  });

  test('projects the window to start on the next business day when today falls on a weekend, implementation already done', () => {
    const testWindow = { start: '2026-09-10', end: '2026-09-11' };
    expect(projectTestWindow({ testWindow, testHasRealProgress: false, implPhaseDone: true, today: '2026-09-12' })).toEqual({
      start: '2026-09-14',
      end: '2026-09-15',
    });
  });

  test('projects the window to start tomorrow (not today) when implementation is still open, since testing cannot start the same day', () => {
    const testWindow = { start: '2026-09-10', end: '2026-09-11' };
    expect(projectTestWindow({ testWindow, testHasRealProgress: false, implPhaseDone: false, today: '2026-09-15' })).toEqual({
      start: '2026-09-16',
      end: '2026-09-17',
    });
  });

  test('skips the weekend when projecting to tomorrow, implementation still open', () => {
    const testWindow = { start: '2026-09-10', end: '2026-09-11' };
    expect(projectTestWindow({ testWindow, testHasRealProgress: false, implPhaseDone: false, today: '2026-09-11' })).toEqual({
      start: '2026-09-14',
      end: '2026-09-15',
    });
  });
});

describe('computeTestFillRange', () => {
  const testWindow = { start: '2026-08-26', end: '2026-08-27' };

  test('returns null when there is no test window', () => {
    expect(
      computeTestFillRange({
        testWindow: null,
        firstTestWorklogDate: null,
        testHasLoggedHours: false,
        testPhaseDone: false,
        isDone: false,
        testDone: false,
        deliveredDate: null,
        today: '2026-09-15',
      }),
    ).toBeNull();
  });

  test('grows from the first test worklog to today while still in progress', () => {
    expect(
      computeTestFillRange({
        testWindow,
        firstTestWorklogDate: '2026-09-01',
        testHasLoggedHours: true,
        testPhaseDone: false,
        isDone: false,
        testDone: false,
        deliveredDate: null,
        today: '2026-09-15',
      }),
    ).toEqual({ start: '2026-09-01', end: '2026-09-15' });
  });

  test('stops at the delivered date once done, when real hours were logged', () => {
    expect(
      computeTestFillRange({
        testWindow,
        firstTestWorklogDate: '2026-09-01',
        testHasLoggedHours: true,
        testPhaseDone: true,
        isDone: false,
        testDone: true,
        deliveredDate: '2026-09-08',
        today: '2026-09-15',
      }),
    ).toEqual({ start: '2026-09-01', end: '2026-09-08' });
  });

  // Bug real: COM-66358/COM-66089 têm a subtarefa de Teste "Atendida" (testDone) mas ZERO horas
  // apontadas (ninguém logou tempo nela) — a barra virava um bloco sólido enorme, do início previsto
  // (semanas atrás) até a entrega, como se o teste tivesse ocupado todo esse período.
  test('collapses to a single point at the delivered date when the subtask is done but has no real logged hours', () => {
    expect(
      computeTestFillRange({
        testWindow,
        firstTestWorklogDate: null,
        testHasLoggedHours: false,
        testPhaseDone: true,
        isDone: false,
        testDone: true,
        deliveredDate: '2026-09-08',
        today: '2026-09-15',
      }),
    ).toEqual({ start: '2026-09-08', end: '2026-09-08' });
  });

  test('falls back to the predicted window start when done-without-hours has no delivered date either', () => {
    expect(
      computeTestFillRange({
        testWindow,
        firstTestWorklogDate: null,
        testHasLoggedHours: false,
        testPhaseDone: true,
        isDone: false,
        testDone: true,
        deliveredDate: null,
        today: '2026-09-15',
      }),
    ).toEqual({ start: '2026-08-26', end: '2026-08-26' });
  });

  test('falls back to the predicted window start for the first-worklog date when hours came only from bug entries', () => {
    expect(
      computeTestFillRange({
        testWindow,
        firstTestWorklogDate: null,
        testHasLoggedHours: true,
        testPhaseDone: false,
        isDone: false,
        testDone: false,
        deliveredDate: null,
        today: '2026-09-15',
      }),
    ).toEqual({ start: '2026-08-26', end: '2026-09-15' });
  });

  test('has not started yet: no real progress and no logged hours', () => {
    expect(
      computeTestFillRange({
        testWindow,
        firstTestWorklogDate: null,
        testHasLoggedHours: false,
        testPhaseDone: false,
        isDone: false,
        testDone: false,
        deliveredDate: null,
        today: '2026-09-15',
      }),
    ).toEqual({ start: '2026-08-26', end: '2026-08-26' });
  });
});

describe('isDeveloperAvailable', () => {
  test('true when every activity has its Implementação done', () => {
    expect(isDeveloperAvailable([activity({ implDone: true }), activity({ implDone: true, isDone: true })])).toBe(true);
  });

  test('true via isDone even when implDone is false (e.g. a legacy/edge-case record)', () => {
    expect(isDeveloperAvailable([activity({ implDone: false, isDone: true })])).toBe(true);
  });

  test('false when any activity still has Implementação open', () => {
    expect(isDeveloperAvailable([activity({ implDone: true }), activity({ implDone: false })])).toBe(false);
  });

  test('false for an empty list — no activities means nothing to confirm as done', () => {
    expect(isDeveloperAvailable([])).toBe(false);
  });
});

describe('isWorkingOnBugs', () => {
  test('true when an unresolved bug is assigned to the developer, in any activity', () => {
    const activities = [activity({ bugs: [bug({ developer: 'Fulano', status: 'Em correção' })] })];
    expect(isWorkingOnBugs('Fulano', activities)).toBe(true);
  });

  test('false when the developer has no bugs at all', () => {
    const activities = [activity({ bugs: [] })];
    expect(isWorkingOnBugs('Fulano', activities)).toBe(false);
  });

  test('false when the developer\'s bugs are all resolved (Atendida)', () => {
    const activities = [activity({ bugs: [bug({ developer: 'Fulano', status: 'Atendida' })] })];
    expect(isWorkingOnBugs('Fulano', activities)).toBe(false);
  });

  test('false when the unresolved bug belongs to someone else', () => {
    const activities = [activity({ bugs: [bug({ developer: 'Beltrano', status: 'Em correção' })] })];
    expect(isWorkingOnBugs('Fulano', activities)).toBe(false);
  });

  test('finds a bug on an activity that is not even "owned" by this developer — scans across all given activities', () => {
    const activities = [activity({ developer: 'Beltrano', bugs: [bug({ developer: 'Fulano', status: 'Em correção' })] })];
    expect(isWorkingOnBugs('Fulano', activities)).toBe(true);
  });
});

describe('matchesLegendFilter', () => {
  test('shows everything when no legend filter is active', () => {
    expect(matchesLegendFilter(activity(), { bugOnly: false, atrasoOnly: false })).toBe(true);
  });

  test('bugOnly hides activities with no bugs', () => {
    expect(matchesLegendFilter(activity({ bugs: [] }), { bugOnly: true, atrasoOnly: false })).toBe(false);
  });

  test('bugOnly keeps activities that have at least one bug', () => {
    expect(matchesLegendFilter(activity({ bugs: [bug()] }), { bugOnly: true, atrasoOnly: false })).toBe(true);
  });

  test('atrasoOnly hides activities that are not overdue', () => {
    expect(matchesLegendFilter(activity({ isOverdue: false }), { bugOnly: false, atrasoOnly: true })).toBe(false);
  });

  test('atrasoOnly keeps activities that are overdue', () => {
    expect(matchesLegendFilter(activity({ isOverdue: true }), { bugOnly: false, atrasoOnly: true })).toBe(true);
  });

  test('combines bugOnly and atrasoOnly as AND — requires both to pass', () => {
    const overdueNoBugs = activity({ isOverdue: true, bugs: [] });
    const bugsNotOverdue = activity({ isOverdue: false, bugs: [bug()] });
    const both = activity({ isOverdue: true, bugs: [bug()] });
    const filters = { bugOnly: true, atrasoOnly: true };
    expect(matchesLegendFilter(overdueNoBugs, filters)).toBe(false);
    expect(matchesLegendFilter(bugsNotOverdue, filters)).toBe(false);
    expect(matchesLegendFilter(both, filters)).toBe(true);
  });

  test('addedLateOnly hides activities not flagged as addedAfterSprintStart', () => {
    expect(
      matchesLegendFilter(activity({ addedAfterSprintStart: false }), { bugOnly: false, atrasoOnly: false, addedLateOnly: true }),
    ).toBe(false);
  });

  test('addedLateOnly keeps activities flagged as addedAfterSprintStart', () => {
    expect(
      matchesLegendFilter(activity({ addedAfterSprintStart: true }), { bugOnly: false, atrasoOnly: false, addedLateOnly: true }),
    ).toBe(true);
  });

  test('addedLateOnly combines with the other filters as AND', () => {
    const lateNotOverdue = activity({ addedAfterSprintStart: true, isOverdue: false });
    const overdueNotLate = activity({ addedAfterSprintStart: false, isOverdue: true });
    const both = activity({ addedAfterSprintStart: true, isOverdue: true });
    const filters = { bugOnly: false, atrasoOnly: true, addedLateOnly: true };
    expect(matchesLegendFilter(lateNotOverdue, filters)).toBe(false);
    expect(matchesLegendFilter(overdueNotLate, filters)).toBe(false);
    expect(matchesLegendFilter(both, filters)).toBe(true);
  });
});

describe('computeOverrunDash', () => {
  test('returns null when the feature is disabled, even if the phase overran', () => {
    expect(computeOverrunDash(100, 140, false)).toBeNull();
  });

  test('returns null when enabled but the phase has not overrun (fillRight within the box)', () => {
    expect(computeOverrunDash(100, 100.5, true)).toBeNull();
  });

  test('returns the overrun rectangle from boxRight to fillRight when enabled and overrun', () => {
    expect(computeOverrunDash(100, 140, true)).toEqual({ left: 100, width: 40 });
  });

  test('clamps to a minimum width so a barely-late overrun stays visible', () => {
    expect(computeOverrunDash(100, 102, true)).toEqual({ left: 100, width: 4 });
  });
});

describe('computeSprintCompletion', () => {
  test('returns all zeroes for an empty activity list', () => {
    expect(computeSprintCompletion([])).toEqual({ doneCount: 0, totalCount: 0, percent: 0 });
  });

  test('counts isDone activities as done', () => {
    const result = computeSprintCompletion([activity({ isDone: true }), activity({ isDone: false })]);
    expect(result).toEqual({ doneCount: 1, totalCount: 2, percent: 50 });
  });

  test('counts testDone (Aguardando liberação) activities as done too, even without isDone', () => {
    const result = computeSprintCompletion([activity({ isDone: false, testDone: true }), activity({ isDone: false, testDone: false })]);
    expect(result).toEqual({ doneCount: 1, totalCount: 2, percent: 50 });
  });

  test('does not double count an activity that is both isDone and testDone', () => {
    const result = computeSprintCompletion([activity({ isDone: true, testDone: true })]);
    expect(result).toEqual({ doneCount: 1, totalCount: 1, percent: 100 });
  });

  test('rounds the percentage', () => {
    const result = computeSprintCompletion([activity({ isDone: true }), activity({ isDone: false }), activity({ isDone: false })]);
    expect(result.percent).toBe(33);
  });

  test('bugs on an activity never count toward the totals, only the activity itself does', () => {
    const busyWithBugs = activity({ isDone: false, testDone: false, bugs: [bug(), bug(), bug()] });
    expect(computeSprintCompletion([busyWithBugs])).toEqual({ doneCount: 0, totalCount: 1, percent: 0 });
  });
});

describe('formatStatusBreakdownTooltip', () => {
  test('returns an empty string for an empty activity list', () => {
    expect(formatStatusBreakdownTooltip([])).toBe('');
  });

  test('formats a single status at 100%', () => {
    const activities = [activity({ status: 'Em andamento' }), activity({ status: 'Em andamento' })];
    expect(formatStatusBreakdownTooltip(activities)).toBe('Em andamento: 100% (2)');
  });

  test('formats multiple statuses, one per line, with rounded percentages', () => {
    const activities = [
      activity({ status: 'Em andamento' }),
      activity({ status: 'Em andamento' }),
      activity({ isDone: true, status: 'Atendida' }),
    ];
    const lines = formatStatusBreakdownTooltip(activities).split('\n');
    expect(lines).toContain('Em andamento: 67% (2)');
    expect(lines).toContain('Atendida: 33% (1)');
    expect(lines).toHaveLength(2);
  });
});

describe('groupBugsByArtifact', () => {
  test('returns an empty array for no bugs', () => {
    expect(groupBugsByArtifact([])).toEqual([]);
  });

  test('groups bugs by artifact, ordered Requisito then Implementação', () => {
    const bugRequisito = bug({ key: 'B1', artifact: 'requisito' });
    const bugImpl = bug({ key: 'B2', artifact: 'implementacao' });
    const groups = groupBugsByArtifact([bugImpl, bugRequisito]);

    expect(groups.map((g) => g.key)).toEqual(['requisito', 'implementacao']);
    expect(groups[0].label).toBe('Requisito');
    expect(groups[0].bugs).toEqual([bugRequisito]);
    expect(groups[1].label).toBe('Implementação');
    expect(groups[1].bugs).toEqual([bugImpl]);
  });

  test('omits a group entirely when it has no bugs', () => {
    const groups = groupBugsByArtifact([bug({ artifact: 'requisito' })]);
    expect(groups.map((g) => g.key)).toEqual(['requisito']);
  });

  test('puts bugs with no recognized artifact in a trailing "Sem artefato" group', () => {
    const groups = groupBugsByArtifact([bug({ artifact: null })]);
    expect(groups.map((g) => g.key)).toEqual([null]);
    expect(groups[0].label).toBe('Sem artefato');
  });

  test('keeps the same resolved-first ordering as today within each group', () => {
    const unresolved = bug({ key: 'B1', artifact: 'requisito', status: 'Em correção' });
    const resolved = bug({ key: 'B2', artifact: 'requisito', status: 'Atendida' });
    const groups = groupBugsByArtifact([unresolved, resolved]);
    expect(groups[0].bugs.map((b) => b.key)).toEqual(['B2', 'B1']);
  });
});

describe('groupBugsByStatus', () => {
  test('returns an empty array for no bugs', () => {
    expect(groupBugsByStatus([])).toEqual([]);
  });

  test('puts a bug with an active status (e.g. "Em correção") under "Em andamento", expanded by default', () => {
    const groups = groupBugsByStatus([bug({ key: 'B1', status: 'Em correção' })]);
    expect(groups).toEqual([{ key: 'em-andamento', label: 'Em andamento', collapsedByDefault: false, bugs: [expect.objectContaining({ key: 'B1' })] }]);
  });

  test('puts a bug with status "Não atendida" in its own group, expanded by default', () => {
    const groups = groupBugsByStatus([bug({ key: 'B1', status: 'Não atendida' })]);
    expect(groups).toEqual([{ key: 'nao-atendida', label: 'Não atendida', collapsedByDefault: false, bugs: [expect.objectContaining({ key: 'B1' })] }]);
  });

  test('puts a bug with status "Atendida" under "Atendidos", collapsed by default', () => {
    const groups = groupBugsByStatus([bug({ key: 'B1', status: 'Atendida' })]);
    expect(groups).toEqual([{ key: 'atendida', label: 'Atendidos', collapsedByDefault: true, bugs: [expect.objectContaining({ key: 'B1' })] }]);
  });

  test('treats other active statuses (e.g. "Em testes", "Disponível para testes") as "Em andamento" too', () => {
    const groups = groupBugsByStatus([bug({ key: 'B1', status: 'Em testes' }), bug({ key: 'B2', status: 'Disponível para testes' })]);
    expect(groups.map((g) => g.key)).toEqual(['em-andamento']);
    expect(groups[0].bugs.map((b) => b.key)).toEqual(['B1', 'B2']);
  });

  test('omits a group entirely when it has no bugs', () => {
    const groups = groupBugsByStatus([bug({ status: 'Atendida' })]);
    expect(groups.map((g) => g.key)).toEqual(['atendida']);
  });

  test('orders groups as Em andamento, Não atendida, Atendidos regardless of input order', () => {
    const groups = groupBugsByStatus([
      bug({ key: 'B1', status: 'Atendida' }),
      bug({ key: 'B2', status: 'Não atendida' }),
      bug({ key: 'B3', status: 'Em correção' }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['em-andamento', 'nao-atendida', 'atendida']);
  });

  test('is case/accent-insensitive when matching status text', () => {
    const groups = groupBugsByStatus([bug({ status: 'ATENDIDA' })]);
    expect(groups.map((g) => g.key)).toEqual(['atendida']);
  });
});

describe('formatFullDate', () => {
  test('formats an ISO date as DD/MM/YYYY', () => {
    expect(formatFullDate('2026-10-05')).toBe('05/10/2026');
  });
});

describe('resolveDeadlineRulers', () => {
  const deadlines = { lastPublishDay: '2026-09-10', lastTestDay: '2026-09-12', publishDay: '2026-09-15' };

  test('returns nothing when the switch is off, regardless of configured dates', () => {
    expect(resolveDeadlineRulers(false, deadlines, [], [])).toEqual([]);
  });

  test('returns the 3 configured deadlines when the switch is on and no sprint is selected', () => {
    const rulers = resolveDeadlineRulers(true, deadlines, [], []);
    expect(rulers.map((r) => r.key)).toEqual(['lastPublishDay', 'lastTestDay', 'publishDay']);
    expect(rulers.map((r) => r.date)).toEqual(['2026-09-10', '2026-09-12', '2026-09-15']);
  });

  test('omits a deadline ruler whose date is not configured', () => {
    const rulers = resolveDeadlineRulers(true, { ...deadlines, lastTestDay: null }, [], []);
    expect(rulers.map((r) => r.key)).toEqual(['lastPublishDay', 'publishDay']);
  });

  test('adds a 4th ruler for the sprint end date when exactly one sprint is selected', () => {
    const sprints = [sprintInfo({ id: 'S1', name: 'Sprint 1', endDate: '2026-09-20' })];
    const rulers = resolveDeadlineRulers(true, deadlines, ['S1'], sprints);
    expect(rulers.map((r) => r.key)).toEqual(['lastPublishDay', 'lastTestDay', 'publishDay', 'sprintEnd']);
    expect(rulers[3].date).toBe('2026-09-20');
  });

  test('does not add the sprint end ruler when no sprint or more than one sprint is selected', () => {
    const sprints = [sprintInfo({ id: 'S1', endDate: '2026-09-20' }), sprintInfo({ id: 'S2', endDate: '2026-10-05' })];
    expect(resolveDeadlineRulers(true, deadlines, [], sprints).some((r) => r.key === 'sprintEnd')).toBe(false);
    expect(resolveDeadlineRulers(true, deadlines, ['S1', 'S2'], sprints).some((r) => r.key === 'sprintEnd')).toBe(false);
  });

  test('gives each ruler a distinct color and only the sprint end ruler pulses', () => {
    const sprints = [sprintInfo({ id: 'S1', endDate: '2026-09-20' })];
    const rulers = resolveDeadlineRulers(true, deadlines, ['S1'], sprints);
    const byKey = Object.fromEntries(rulers.map((r) => [r.key, r]));
    expect(byKey.lastPublishDay).toMatchObject({ color: 'var(--text-muted)', pulse: false });
    expect(byKey.lastTestDay).toMatchObject({ color: 'var(--series-test)', pulse: false });
    expect(byKey.publishDay).toMatchObject({ color: 'var(--status-critical)', pulse: false });
    expect(byKey.sprintEnd).toMatchObject({ color: 'var(--status-good)', pulse: true });
  });

  test('the 3 configured deadlines render as badges; only the sprint end ruler renders as a bar', () => {
    const sprints = [sprintInfo({ id: 'S1', endDate: '2026-09-20' })];
    const rulers = resolveDeadlineRulers(true, deadlines, ['S1'], sprints);
    const byKey = Object.fromEntries(rulers.map((r) => [r.key, r]));
    expect(byKey.lastPublishDay).toMatchObject({ display: 'badge', badgeText: 'ddl imp', label: 'Último dia implementação' });
    expect(byKey.lastTestDay).toMatchObject({ display: 'badge', badgeText: 'ddl qa' });
    expect(byKey.publishDay).toMatchObject({ display: 'badge', badgeText: 'deploy' });
    expect(byKey.sprintEnd).toMatchObject({ display: 'bar' });
  });
});

describe('groupDeadlineBadges', () => {
  function ruler(overrides: Partial<DeadlineRuler>): DeadlineRuler {
    return {
      key: 'lastPublishDay',
      label: 'Último dia implementação',
      date: '2026-09-10',
      color: 'var(--text-muted)',
      pulse: false,
      display: 'badge',
      badgeText: 'ddl imp',
      ...overrides,
    };
  }

  test('groups badge rulers by their exact date when it is a visible business day', () => {
    const dayIndexByDate = new Map([
      ['2026-09-10', 0],
      ['2026-09-11', 1],
    ]);
    const groups = groupDeadlineBadges([ruler({ date: '2026-09-10' })], dayIndexByDate);
    expect(groups).toEqual([{ date: '2026-09-10', badges: [ruler({ date: '2026-09-10' })] }]);
  });

  test('snaps a weekend date forward to the next visible business day, same as the ruler bars do', () => {
    // 2026-09-12 is a Saturday; next business day in the map is Monday 2026-09-14.
    const dayIndexByDate = new Map([
      ['2026-09-11', 0],
      ['2026-09-14', 1],
    ]);
    const groups = groupDeadlineBadges([ruler({ key: 'lastTestDay', badgeText: 'ddl qa', date: '2026-09-12' })], dayIndexByDate);
    expect(groups).toEqual([{ date: '2026-09-14', badges: [ruler({ key: 'lastTestDay', badgeText: 'ddl qa', date: '2026-09-12' })] }]);
  });

  test('stacks multiple badges that land on the same visible day, preserving ruler order', () => {
    const dayIndexByDate = new Map([['2026-09-10', 0]]);
    const a = ruler({ key: 'lastPublishDay', badgeText: 'ddl imp', date: '2026-09-10' });
    const b = ruler({ key: 'publishDay', badgeText: 'deploy', date: '2026-09-10', color: 'var(--status-critical)' });
    expect(groupDeadlineBadges([a, b], dayIndexByDate)).toEqual([{ date: '2026-09-10', badges: [a, b] }]);
  });

  test('ignores bar-display rulers (e.g. sprint end) entirely', () => {
    const dayIndexByDate = new Map([['2026-09-10', 0]]);
    const bar = ruler({ key: 'sprintEnd', display: 'bar', badgeText: '', date: '2026-09-10' });
    expect(groupDeadlineBadges([bar], dayIndexByDate)).toEqual([]);
  });
});
