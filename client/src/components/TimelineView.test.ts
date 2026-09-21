import { describe, expect, test } from 'vitest';
import {
  computeDailyHours,
  computeImplFillEndDate,
  computeTestFillRange,
  dayFillRatio,
  formatConsumedPercent,
  isDeveloperAvailable,
  isWorkingOnBugs,
  lastWorklogDate,
  projectTestWindow,
} from './TimelineView.js';
import type { Activity, BugSubtask, WorklogEntry } from '../types.js';

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
    worklogEntries: [],
    bugs: [],
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
