import { describe, expect, test } from 'vitest';
import {
  computeKpis,
  computePersonSummaries,
  computeSprintSummaries,
  computeStatusSummaries,
  foldStatusSummariesForChart,
  computeRealizedProductivity,
  topActivitiesByBugCount,
} from './computeIndicators.js';
import type { Activity } from '../types.js';

function activity(overrides: Partial<Activity>): Activity {
  return {
    key: 'EC-1',
    url: 'https://desenv.betha.com.br/browse/EC-1',
    title: 'Atividade',
    sprintId: '7590',
    sprintName: 'ALM S09 2026 Edital',
    isCarried: false,
    developer: 'Fulano',
    tester: null,
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
    addedAfterSprintStart: false,
    sprintEnteredAt: null,
    ...overrides,
  };
}

describe('computeKpis', () => {
  test('counts totals, done, at-risk and carried activities', () => {
    const activities = [
      activity({ key: 'A', isDone: true, storyPoints: 10 }),
      activity({ key: 'B', isOverdue: true, storyPoints: 5 }),
      activity({ key: 'C', isCarried: true, storyPoints: 3 }),
      activity({ key: 'D', storyPoints: null }),
    ];

    const kpis = computeKpis(activities, '2026-09-08');

    expect(kpis.totalActivities).toBe(4);
    expect(kpis.totalStoryPoints).toBe(18);
    expect(kpis.doneCount).toBe(1);
    expect(kpis.atRiskCount).toBe(1);
    expect(kpis.carriedCount).toBe(1);
  });

  test('counts open bugs and computes the average bugs per activity', () => {
    const activities = [
      activity({ key: 'A', bugs: [{ key: 'B1', title: 'x', developer: null, status: 's', startDate: '2026-09-01', endDate: '2026-09-02', worklogEntries: [] }] }),
      activity({ key: 'B', bugs: [] }),
    ];

    const kpis = computeKpis(activities, '2026-09-08');

    expect(kpis.openBugsCount).toBe(1);
    expect(kpis.bugsPerActivity).toBeCloseTo(0.5);
  });

  test('returns zeroed KPIs for an empty activity list', () => {
    const kpis = computeKpis([], '2026-09-08');
    expect(kpis.totalActivities).toBe(0);
    expect(kpis.bugsPerActivity).toBe(0);
  });

  test('counts activities added after sprint start and sums their story points', () => {
    const activities = [
      activity({ key: 'A', addedAfterSprintStart: true, storyPoints: 4 }),
      activity({ key: 'B', addedAfterSprintStart: true, storyPoints: 2 }),
      activity({ key: 'C', addedAfterSprintStart: false, storyPoints: 10 }),
    ];

    const kpis = computeKpis(activities, '2026-09-08');

    expect(kpis.addedLateCount).toBe(2);
    expect(kpis.addedLateStoryPoints).toBe(6);
  });

  test('treats a null storyPoints on an added-late activity as 0 towards the sum', () => {
    const activities = [activity({ key: 'A', addedAfterSprintStart: true, storyPoints: null })];

    const kpis = computeKpis(activities, '2026-09-08');

    expect(kpis.addedLateCount).toBe(1);
    expect(kpis.addedLateStoryPoints).toBe(0);
  });

  test('zeroes added-late KPIs when nothing was added after sprint start', () => {
    const kpis = computeKpis([activity({ addedAfterSprintStart: false })], '2026-09-08');
    expect(kpis.addedLateCount).toBe(0);
    expect(kpis.addedLateStoryPoints).toBe(0);
  });
});

describe('computeRealizedProductivity', () => {
  test('returns null with zero sample size when there are no completed activities', () => {
    const activities = [activity({ key: 'A', isDone: false })];
    const result = computeRealizedProductivity(activities, 5);
    expect(result.hoursPerPf).toBeNull();
    expect(result.accuracyPercent).toBeNull();
    expect(result.sampleSize).toBe(0);
  });

  test('computes hours per PF for a single completed activity from logged hours', () => {
    const activities = [activity({ key: 'A', isDone: true, storyPoints: 5, implLoggedHours: 24, testLoggedHours: 8 })];
    // 24h + 8h = 32h apontadas para 5 PF -> 6.4h/PF
    const result = computeRealizedProductivity(activities, 5);
    expect(result.hoursPerPf).toBeCloseTo(6.4);
    expect(result.sampleSize).toBe(1);
  });

  test('weights the average by story points across completed activities', () => {
    const activities = [
      activity({ key: 'A', isDone: true, storyPoints: 10, implLoggedHours: 64, testLoggedHours: 0 }), // 64h / 10 PF
      activity({ key: 'B', isDone: true, storyPoints: 2, implLoggedHours: 8, testLoggedHours: 0 }), // 8h / 2 PF
    ];
    // (64h + 8h) / (10 PF + 2 PF) = 72 / 12 = 6
    const result = computeRealizedProductivity(activities, 5);
    expect(result.hoursPerPf).toBeCloseTo(72 / 12);
    expect(result.sampleSize).toBe(2);
  });

  test('ignores activities not done, without an estimate, or without any logged hours', () => {
    const activities = [
      activity({ key: 'A', isDone: true, storyPoints: 5, implLoggedHours: 32, testLoggedHours: 0 }),
      activity({ key: 'B', isDone: false, storyPoints: 5, implLoggedHours: 32 }),
      activity({ key: 'C', isDone: true, storyPoints: null, implLoggedHours: 32 }),
      activity({ key: 'D', isDone: true, storyPoints: 5, implLoggedHours: null, testLoggedHours: null }),
    ];
    const result = computeRealizedProductivity(activities, 5);
    expect(result.sampleSize).toBe(1);
    expect(result.hoursPerPf).toBeCloseTo(6.4);
  });

  test('treats a null implLoggedHours or testLoggedHours as 0 when summing, as long as one of them has data', () => {
    const activities = [activity({ key: 'A', isDone: true, storyPoints: 10, implLoggedHours: 40, testLoggedHours: null })];
    // apontado: 40h + 0h = 40h / 10 PF = 4h/PF
    const result = computeRealizedProductivity(activities, 5);
    expect(result.hoursPerPf).toBeCloseTo(4);
  });

  test('computes 100% accuracy when total estimated hours match total logged hours', () => {
    const activities = [activity({ key: 'A', isDone: true, storyPoints: 10, implLoggedHours: 60, testLoggedHours: 20 })];
    // estimado: 10 PF x 8h/PF = 80h; apontado: 60h + 20h = 80h
    const result = computeRealizedProductivity(activities, 8);
    expect(result.accuracyPercent).toBeCloseTo(100);
  });

  test('computes accuracy above 100% when more hours were logged than estimated (subestimamos)', () => {
    const activities = [activity({ key: 'A', isDone: true, storyPoints: 10, implLoggedHours: 50, testLoggedHours: 14 })];
    // estimado: 10 PF x 5h/PF = 50h; apontado: 50h + 14h = 64h -> 64/50 = 128%
    const result = computeRealizedProductivity(activities, 5);
    expect(result.accuracyPercent).toBeCloseTo(128);
  });

  test('computes accuracy below 100% when fewer hours were logged than estimated (superestimamos)', () => {
    const activities = [activity({ key: 'A', isDone: true, storyPoints: 10, implLoggedHours: 30, testLoggedHours: 18 })];
    // estimado: 10 PF x 8h/PF = 80h; apontado: 30h + 18h = 48h -> 48/80 = 60%
    const result = computeRealizedProductivity(activities, 8);
    expect(result.accuracyPercent).toBeCloseTo(60);
  });

  test('returns null for both metrics when there are no eligible activities', () => {
    const activities = [activity({ key: 'A', isDone: false, storyPoints: 5, implLoggedHours: 10 })];
    const result = computeRealizedProductivity(activities, 5);
    expect(result.hoursPerPf).toBeNull();
    expect(result.accuracyPercent).toBeNull();
    expect(result.sampleSize).toBe(0);
  });

  test('excludes a done activity with no logged hours at all', () => {
    const activities = [activity({ key: 'A', isDone: true, storyPoints: 5, implLoggedHours: null, testLoggedHours: null })];
    const result = computeRealizedProductivity(activities, 5);
    expect(result.hoursPerPf).toBeNull();
    expect(result.accuracyPercent).toBeNull();
    expect(result.sampleSize).toBe(0);
  });

  test('accuracyWithBugsPercent equals accuracyPercent when there are no bug hours', () => {
    const activities = [activity({ key: 'A', isDone: true, storyPoints: 10, implLoggedHours: 50, testLoggedHours: 14 })];
    const result = computeRealizedProductivity(activities, 5);
    expect(result.accuracyWithBugsPercent).toBeCloseTo(result.accuracyPercent!);
  });

  test('accuracyWithBugsPercent adds bug hours on top of Implementação + Teste', () => {
    const activities = [activity({ key: 'A', isDone: true, storyPoints: 10, implLoggedHours: 50, testLoggedHours: 14, bugsLoggedHours: 16 })];
    // estimado: 10 PF x 5h/PF = 50h; apontado com bugs: 50h + 14h + 16h = 80h -> 80/50 = 160%
    const result = computeRealizedProductivity(activities, 5);
    expect(result.accuracyPercent).toBeCloseTo(128); // sem bugs, igual ao teste acima
    expect(result.accuracyWithBugsPercent).toBeCloseTo(160);
  });

  test('testSharePercent computes the share of Teste hours out of Implementação + Teste, ignoring bugs', () => {
    const activities = [activity({ key: 'A', isDone: true, storyPoints: 10, implLoggedHours: 70, testLoggedHours: 30, bugsLoggedHours: 100 })];
    // 30h de Teste em 100h de Impl+Teste (bugs de fora) -> 30%
    const result = computeRealizedProductivity(activities, 5);
    expect(result.testSharePercent).toBeCloseTo(30);
  });

  test('leaves testSharePercent null when there are no eligible activities', () => {
    const activities = [activity({ key: 'A', isDone: false, storyPoints: 5, implLoggedHours: 10 })];
    const result = computeRealizedProductivity(activities, 5);
    expect(result.testSharePercent).toBeNull();
  });

  // Implementação + Teste "Atendida" (status "Aguardando liberação") já é trabalho funcionalmente
  // concluído — não devia esperar o fechamento formal da story (isDone) pra entrar nos indicadores.
  test('includes an activity awaiting release (testDone) even though the story itself is not formally closed', () => {
    const activities = [
      activity({ key: 'A', isDone: false, testDone: true, storyPoints: 10, implLoggedHours: 40, testLoggedHours: 10 }),
    ];
    const result = computeRealizedProductivity(activities, 5);
    expect(result.sampleSize).toBe(1);
    expect(result.hoursPerPf).toBeCloseTo(5);
  });
});

describe('computePersonSummaries', () => {
  test('aggregates activities, story points and bugs per developer', () => {
    const activities = [
      activity({ key: 'A', developer: 'Alicio', storyPoints: 10, isDone: true }),
      activity({
        key: 'B',
        developer: 'Alicio',
        storyPoints: 5,
        isOverdue: true,
        bugs: [{ key: 'B1', title: 'x', developer: null, status: 's', startDate: '2026-09-01', endDate: '2026-09-02', worklogEntries: [] }],
      }),
      activity({ key: 'C', developer: 'Bia', storyPoints: null }),
    ];

    const summaries = computePersonSummaries(activities);
    const alicio = summaries.find((s) => s.person === 'Alicio');
    const bia = summaries.find((s) => s.person === 'Bia');

    expect(alicio).toEqual({
      person: 'Alicio',
      activities: 2,
      storyPoints: 15,
      bugs: 1,
      done: 1,
      atRisk: 1,
      inProgress: 0,
      noEstimate: 0,
    });
    expect(bia).toEqual({
      person: 'Bia',
      activities: 1,
      storyPoints: 0,
      bugs: 0,
      done: 0,
      atRisk: 0,
      inProgress: 1,
      noEstimate: 1,
    });
  });

  test('sorts summaries by story points descending', () => {
    const activities = [
      activity({ key: 'A', developer: 'Baixo', storyPoints: 2 }),
      activity({ key: 'B', developer: 'Alto', storyPoints: 20 }),
    ];
    const summaries = computePersonSummaries(activities);
    expect(summaries.map((s) => s.person)).toEqual(['Alto', 'Baixo']);
  });
});

describe('computeSprintSummaries', () => {
  test('aggregates activities per sprint', () => {
    const activities = [
      activity({ key: 'A', sprintName: 'Sprint 1', storyPoints: 10, isDone: true }),
      activity({ key: 'B', sprintName: 'Sprint 1', storyPoints: 5, isOverdue: true }),
      activity({ key: 'C', sprintName: 'Sprint 2', storyPoints: 3 }),
    ];

    const summaries = computeSprintSummaries(activities);
    const sprint1 = summaries.find((s) => s.sprintName === 'Sprint 1');

    expect(sprint1).toEqual({
      sprintName: 'Sprint 1',
      activities: 2,
      totalStoryPoints: 15,
      bugs: 0,
      done: 1,
      atRisk: 1,
    });
  });
});

describe('computeStatusSummaries', () => {
  test('aggregates activities per status, counting story points and at-risk activities', () => {
    const activities = [
      activity({ key: 'A', status: 'Em andamento', storyPoints: 10 }),
      activity({ key: 'B', status: 'Em andamento', storyPoints: 5, isOverdue: true }),
      activity({ key: 'C', status: 'Em testes', storyPoints: 3 }),
    ];

    const summaries = computeStatusSummaries(activities);
    const emAndamento = summaries.find((s) => s.status === 'Em andamento');

    expect(emAndamento).toEqual({ status: 'Em andamento', activities: 2, storyPoints: 15, atRisk: 1 });
  });

  test('groups a not-started activity under "Ainda não iniciada", regardless of its raw Jira status', () => {
    const activities = [activity({ key: 'A', notStarted: true, status: 'Novo', storyPoints: 5 })];

    const summaries = computeStatusSummaries(activities);

    expect(summaries).toEqual([{ status: 'Ainda não iniciada', activities: 1, storyPoints: 5, atRisk: 0 }]);
  });

  test('groups a done activity under its real Jira status (e.g. "Atendida"), not a generic label', () => {
    const activities = [activity({ key: 'A', isDone: true, status: 'Atendida', storyPoints: 5 })];

    const summaries = computeStatusSummaries(activities);

    expect(summaries).toEqual([{ status: 'Atendida', activities: 1, storyPoints: 5, atRisk: 0 }]);
  });

  test('treats storyPoints null as 0 when summing', () => {
    const activities = [activity({ key: 'A', status: 'Em andamento', storyPoints: null })];

    const summaries = computeStatusSummaries(activities);

    expect(summaries[0].storyPoints).toBe(0);
  });

  test('orders known statuses by workflow order, regardless of activity count', () => {
    const activities = [
      activity({ key: 'A', isDone: true, status: 'Atendida' }),
      activity({ key: 'B', status: 'Aguardando liberação' }),
      activity({ key: 'C', status: 'Em testes' }),
      activity({ key: 'D', status: 'Ag. início dos testes' }),
      activity({ key: 'E', status: 'Em andamento' }),
      activity({ key: 'F', notStarted: true, status: 'Novo' }),
    ];

    const summaries = computeStatusSummaries(activities);

    expect(summaries.map((s) => s.status)).toEqual([
      'Ainda não iniciada',
      'Em andamento',
      'Ag. início dos testes',
      'Em testes',
      'Aguardando liberação',
      'Atendida',
    ]);
  });

  test('appends unknown statuses after the known workflow order, sorted by activity count descending', () => {
    const activities = [
      activity({ key: 'A', isDone: true, status: 'Cancelada' }),
      activity({ key: 'B', isDone: true, status: 'Rejeitada' }),
      activity({ key: 'C', isDone: true, status: 'Rejeitada' }),
      activity({ key: 'D', status: 'Em andamento' }),
    ];

    const summaries = computeStatusSummaries(activities);

    expect(summaries.map((s) => s.status)).toEqual(['Em andamento', 'Rejeitada', 'Cancelada']);
  });

  function openBug(overrides: Partial<Activity['bugs'][number]> = {}) {
    return { key: 'B-1', title: 'Bug', developer: null, status: 'Em correção', startDate: '2026-09-01', endDate: '2026-09-02', worklogEntries: [], ...overrides };
  }

  test('groups an in-progress activity with an open bug under "Correção de bugs" instead of its normal status', () => {
    const activities = [activity({ key: 'A', status: 'Em testes', bugs: [openBug()] })];

    const summaries = computeStatusSummaries(activities);

    expect(summaries).toEqual([{ status: 'Correção de bugs', activities: 1, storyPoints: 5, atRisk: 0 }]);
  });

  test('does not group under "Correção de bugs" when every bug is already resolved ("Atendida")', () => {
    const activities = [activity({ key: 'A', status: 'Em testes', bugs: [openBug({ status: 'Atendida' })] })];

    const summaries = computeStatusSummaries(activities);

    expect(summaries.map((s) => s.status)).toEqual(['Em testes']);
  });

  test('does not override a done activity\'s status even with an open bug', () => {
    const activities = [activity({ key: 'A', isDone: true, status: 'Atendida', bugs: [openBug()] })];

    const summaries = computeStatusSummaries(activities);

    expect(summaries.map((s) => s.status)).toEqual(['Atendida']);
  });

  test('does not override a not-started activity\'s "Ainda não iniciada" status even with an open bug', () => {
    const activities = [activity({ key: 'A', notStarted: true, status: 'Novo', bugs: [openBug()] })];

    const summaries = computeStatusSummaries(activities);

    expect(summaries.map((s) => s.status)).toEqual(['Ainda não iniciada']);
  });

  test('orders "Correção de bugs" as part of the known workflow order', () => {
    const activities = [
      activity({ key: 'A', isDone: true, status: 'Atendida' }),
      activity({ key: 'B', status: 'Aguardando liberação' }),
      activity({ key: 'C', status: 'Em testes', bugs: [openBug()] }),
      activity({ key: 'D', status: 'Em andamento' }),
    ];

    const summaries = computeStatusSummaries(activities);

    expect(summaries.map((s) => s.status)).toEqual(['Em andamento', 'Aguardando liberação', 'Correção de bugs', 'Atendida']);
  });
});

describe('foldStatusSummariesForChart', () => {
  function summary(status: string, activities: number) {
    return { status, activities, storyPoints: 0, atRisk: 0 };
  }

  test('returns summaries unchanged when at or under the max slice count', () => {
    const summaries = [summary('A', 3), summary('B', 2)];
    expect(foldStatusSummariesForChart(summaries, 6)).toEqual(summaries);
  });

  test('folds statuses past the max slice count into a single "Outros" slice', () => {
    const summaries = [summary('A', 5), summary('B', 4), summary('C', 3), summary('D', 1)];

    const folded = foldStatusSummariesForChart(summaries, 3);

    expect(folded).toEqual([summary('A', 5), summary('B', 4), { status: 'Outros', activities: 4, storyPoints: 0, atRisk: 0 }]);
  });

  test('sums storyPoints and atRisk from the folded statuses into "Outros"', () => {
    const summaries = [
      { status: 'A', activities: 5, storyPoints: 10, atRisk: 1 },
      { status: 'B', activities: 2, storyPoints: 3, atRisk: 0 },
      { status: 'C', activities: 1, storyPoints: 2, atRisk: 1 },
    ];

    const folded = foldStatusSummariesForChart(summaries, 2);

    expect(folded).toEqual([
      { status: 'A', activities: 5, storyPoints: 10, atRisk: 1 },
      { status: 'Outros', activities: 3, storyPoints: 5, atRisk: 1 },
    ]);
  });
});

describe('topActivitiesByBugCount', () => {
  test('returns activities sorted by bug count descending, limited to N', () => {
    const bug = { key: 'B', title: 'x', developer: null, status: 's', startDate: '2026-09-01', endDate: '2026-09-02', worklogEntries: [] };
    const activities = [
      activity({ key: 'A', title: 'Poucos bugs', bugs: [bug] }),
      activity({ key: 'B', title: 'Muitos bugs', bugs: [bug, bug, bug] }),
      activity({ key: 'C', title: 'Sem bugs', bugs: [] }),
    ];

    const top = topActivitiesByBugCount(activities, 2);

    expect(top).toHaveLength(2);
    expect(top[0].key).toBe('B');
    expect(top[0].bugCount).toBe(3);
    expect(top[1].key).toBe('A');
  });

  test('excludes activities with no bugs', () => {
    const activities = [activity({ key: 'A', bugs: [] })];
    expect(topActivitiesByBugCount(activities, 10)).toHaveLength(0);
  });
});
