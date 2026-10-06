import { describe, expect, test } from 'vitest';
import { describeActivityStatus, describeBugSummary, groupActivitiesByDeveloper } from './ReportView.js';
import type { Activity, BugSubtask } from '../types.js';

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
    notImpactsDeploy: false,
    legalRequirement: null,
    legalDeadline: null,
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

describe('describeActivityStatus', () => {
  test('returns "Concluída" when isDone', () => {
    expect(describeActivityStatus(activity({ isDone: true, status: 'Atendida' }))).toBe('Concluída');
  });

  test('returns "Ainda não iniciada" when notStarted', () => {
    expect(describeActivityStatus(activity({ notStarted: true, status: 'Novo' }))).toBe('Ainda não iniciada');
  });

  test('returns "Aguardando liberação" when testDone but not isDone', () => {
    expect(describeActivityStatus(activity({ testDone: true, status: 'Aguardando liberação' }))).toBe('Aguardando liberação');
  });

  test('prefixes "Atrasada - " when overdue and not done/testDone', () => {
    expect(describeActivityStatus(activity({ isOverdue: true, status: 'Em testes' }))).toBe('Atrasada - Em testes');
  });

  test('falls back to the raw status otherwise', () => {
    expect(describeActivityStatus(activity({ status: 'Em andamento' }))).toBe('Em andamento');
  });
});

describe('describeBugSummary', () => {
  test('returns null when there are no bugs', () => {
    expect(describeBugSummary(activity({ bugs: [] }))).toBeNull();
  });

  test('counts bugs split by artifact, in Requisito/Implementação/Sem artefato order', () => {
    const a = activity({
      bugs: [bug({ key: 'B1', artifact: 'requisito' }), bug({ key: 'B2', artifact: 'implementacao' }), bug({ key: 'B3', artifact: 'implementacao' })],
    });
    expect(describeBugSummary(a)).toBe('3 bugs (Requisito: 1, Implementação: 2)');
  });

  test('uses singular "bug" for exactly one', () => {
    const a = activity({ bugs: [bug({ artifact: 'requisito' })] });
    expect(describeBugSummary(a)).toBe('1 bug (Requisito: 1)');
  });

  test('includes "Sem artefato" when a bug has no recognized artifact', () => {
    const a = activity({ bugs: [bug({ artifact: null })] });
    expect(describeBugSummary(a)).toBe('1 bug (Sem artefato: 1)');
  });
});

describe('groupActivitiesByDeveloper', () => {
  test('groups activities under their developer', () => {
    const groups = groupActivitiesByDeveloper([activity({ key: 'A', developer: 'Zeca' }), activity({ key: 'B', developer: 'Zeca' })]);
    expect(groups).toEqual([['Zeca', [expect.objectContaining({ key: 'A' }), expect.objectContaining({ key: 'B' })]]]);
  });

  test('sorts developers alphabetically', () => {
    const groups = groupActivitiesByDeveloper([activity({ key: 'A', developer: 'Zeca' }), activity({ key: 'B', developer: 'Ana' })]);
    expect(groups.map(([developer]) => developer)).toEqual(['Ana', 'Zeca']);
  });

  test('returns an empty array for no activities', () => {
    expect(groupActivitiesByDeveloper([])).toEqual([]);
  });
});
