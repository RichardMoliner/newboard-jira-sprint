import { describe, expect, test } from 'vitest';
import { computeKpis, computePersonSummaries, computeSprintSummaries, topActivitiesByBugCount } from './computeIndicators.js';
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
    status: 'Em andamento',
    isDone: false,
    isOverdue: false,
    implWindow: null,
    testWindow: null,
    bugs: [],
    ...overrides,
  };
}

describe('computeKpis', () => {
  test('counts totals, done, at-risk, carried and no-estimate activities', () => {
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
    expect(kpis.noEstimateCount).toBe(1);
  });

  test('counts open bugs and computes the average bugs per activity', () => {
    const activities = [
      activity({ key: 'A', bugs: [{ key: 'B1', title: 'x', developer: null, status: 's', startDate: '2026-09-01', endDate: '2026-09-02' }] }),
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
        bugs: [{ key: 'B1', title: 'x', developer: null, status: 's', startDate: '2026-09-01', endDate: '2026-09-02' }],
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

describe('topActivitiesByBugCount', () => {
  test('returns activities sorted by bug count descending, limited to N', () => {
    const bug = { key: 'B', title: 'x', developer: null, status: 's', startDate: '2026-09-01', endDate: '2026-09-02' };
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
