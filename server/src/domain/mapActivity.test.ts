import { describe, expect, test } from 'vitest';
import { mapActivity, type RawStory } from './mapActivity.js';
import type { ParsedSprint } from '../jira/parseSprintField.js';
import type { BugSubtask } from './types.js';

const sprint: ParsedSprint = {
  id: '7590',
  name: 'ALM S09 2026 Edital',
  state: 'ACTIVE',
  startDate: '2026-09-03',
  endDate: '2026-10-05',
};

function baseStory(overrides: Partial<RawStory> = {}): RawStory {
  return {
    key: 'EC-11751',
    summary: 'Permitir definir cota de consumo',
    status: 'Em andamento',
    statusCategory: 'Em andamento',
    storyPoints: 3,
    desenvolvedor: 'Guilherme Henrique Gibim de Mello',
    assignee: 'Guilherme Henrique Gibim de Mello',
    testador: 'Luana de Souza Bez Batti',
    created: '2026-07-08T10:26:04.000-0300',
    updated: '2026-09-08T16:37:55.000-0300',
    ...overrides,
  };
}

function bug(overrides: Partial<BugSubtask> = {}): BugSubtask {
  return {
    key: 'EC-11983',
    title: 'Bug de exemplo',
    developer: 'Guilherme Henrique Gibim de Mello',
    status: 'Atendida',
    startDate: '2026-08-27',
    endDate: '2026-09-08',
    worklogEntries: [],
    ...overrides,
  };
}

describe('mapActivity', () => {
  test('builds the Jira browse URL from the base URL and key', () => {
    const activity = mapActivity({
      story: baseStory(),
      sprint,
      implStartDate: '2026-08-04',
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.url).toBe('https://desenv.betha.com.br/browse/EC-11751');
  });

  test('uses the Implementação subtask date as startDate when available', () => {
    const activity = mapActivity({
      story: baseStory(),
      sprint,
      implStartDate: '2026-08-04',
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.startDate).toBe('2026-08-04');
  });

  test('falls back to the story created date when there is no Implementação subtask yet', () => {
    const activity = mapActivity({
      story: baseStory({ created: '2026-07-08T10:26:04.000-0300' }),
      sprint,
      implStartDate: null,
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.startDate).toBe('2026-07-08');
  });

  test('marks as carried when start date precedes the sprint start date', () => {
    const activity = mapActivity({
      story: baseStory(),
      sprint,
      implStartDate: '2026-08-04',
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.isCarried).toBe(true);
  });

  test('computes dueDate from the timeline when storyPoints is set', () => {
    const activity = mapActivity({
      story: baseStory({ storyPoints: 10 }),
      sprint,
      implStartDate: '2026-09-04',
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.dueDate).toBe('2026-09-17');
  });

  test('leaves dueDate null when there is no storyPoints estimate', () => {
    const activity = mapActivity({
      story: baseStory({ storyPoints: null }),
      sprint,
      implStartDate: '2026-09-04',
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.dueDate).toBeNull();
    expect(activity.implWindow).toBeNull();
    expect(activity.testWindow).toBeNull();
  });

  test('flags notStarted when there is no Implementação subtask yet and the story is not done', () => {
    const activity = mapActivity({
      story: baseStory({ storyPoints: 1.75, statusCategory: 'Novo', status: 'Novo', created: '2026-08-12T10:00:00.000-0300' }),
      sprint,
      implStartDate: null,
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.notStarted).toBe(true);
  });

  test('does not flag notStarted once an Implementação subtask exists', () => {
    const activity = mapActivity({
      story: baseStory({ storyPoints: 1.75, statusCategory: 'Em andamento' }),
      sprint,
      implStartDate: '2026-08-04',
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.notStarted).toBe(false);
  });

  test('does not flag a done activity as notStarted, even without an Implementação subtask', () => {
    const activity = mapActivity({
      story: baseStory({ storyPoints: 1.75, statusCategory: 'Concluído', status: 'Atendida' }),
      sprint,
      implStartDate: null,
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.notStarted).toBe(false);
  });

  test('does not project dueDate/implWindow/testWindow for a notStarted activity, even with a storyPoints estimate', () => {
    const activity = mapActivity({
      story: baseStory({ storyPoints: 1.75, statusCategory: 'Novo', created: '2026-08-12T10:00:00.000-0300' }),
      sprint,
      implStartDate: null,
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.dueDate).toBeNull();
    expect(activity.implWindow).toBeNull();
    expect(activity.testWindow).toBeNull();
  });

  test('exposes implDone as a field on the returned activity', () => {
    const activity = mapActivity({
      story: baseStory({ statusCategory: 'Em andamento' }),
      sprint,
      implStartDate: '2026-08-04',
      implDone: true,
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.implDone).toBe(true);
  });

  test('defaults implDone to false when not provided', () => {
    const activity = mapActivity({
      story: baseStory({ statusCategory: 'Em andamento' }),
      sprint,
      implStartDate: '2026-08-04',
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.implDone).toBe(false);
  });

  test('does not flag a notStarted activity as carried, even when its creation date predates the sprint', () => {
    const activity = mapActivity({
      story: baseStory({ storyPoints: 1.75, statusCategory: 'Novo', created: '2026-08-12T10:00:00.000-0300' }),
      sprint, // sprint.startDate is 2026-09-03, after the creation date
      implStartDate: null,
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.isCarried).toBe(false);
  });

  test('does not flag a notStarted activity as overdue', () => {
    const activity = mapActivity({
      story: baseStory({ storyPoints: 1.75, statusCategory: 'Novo', created: '2026-01-01T10:00:00.000-0300' }),
      sprint,
      implStartDate: null,
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.isOverdue).toBe(false);
  });

  test('overrides status to "Ag. início dos testes" when the Implementação subtask is done but the Teste subtask has no worklog yet', () => {
    const activity = mapActivity({
      story: baseStory({ status: 'Em andamento', statusCategory: 'Em andamento' }),
      sprint,
      implStartDate: '2026-08-04',
      implDone: true,
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.status).toBe('Ag. início dos testes');
  });

  test('overrides status to "Em testes" once the Teste subtask has a worklog entry', () => {
    const activity = mapActivity({
      story: baseStory({ status: 'Em andamento', statusCategory: 'Em andamento' }),
      sprint,
      implStartDate: '2026-08-04',
      implDone: true,
      worklogEntries: [{ subtaskType: 'Teste', author: 'Luana de Souza Bez Batti', date: '2026-09-08', hours: 1, comment: null }],
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.status).toBe('Em testes');
  });

  test('ignores Implementação worklog entries when deciding between "Ag. início dos testes" and "Em testes"', () => {
    const activity = mapActivity({
      story: baseStory({ status: 'Em andamento', statusCategory: 'Em andamento' }),
      sprint,
      implStartDate: '2026-08-04',
      implDone: true,
      worklogEntries: [{ subtaskType: 'Implementação', author: 'Fulano', date: '2026-09-05', hours: 4, comment: null }],
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.status).toBe('Ag. início dos testes');
  });

  test('keeps the original story status when the Implementação subtask is not done', () => {
    const activity = mapActivity({
      story: baseStory({ status: 'Em andamento', statusCategory: 'Em andamento' }),
      sprint,
      implStartDate: '2026-08-04',
      implDone: false,
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.status).toBe('Em andamento');
  });

  test('keeps the original story status once the story itself is done, even if implDone is true', () => {
    const activity = mapActivity({
      story: baseStory({ status: 'Atendida', statusCategory: 'Concluído' }),
      sprint,
      implStartDate: '2026-08-04',
      implDone: true,
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.status).toBe('Atendida');
  });

  test('defaults implDone to false when not provided', () => {
    const activity = mapActivity({
      story: baseStory({ status: 'Em andamento', statusCategory: 'Em andamento' }),
      sprint,
      implStartDate: '2026-08-04',
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.status).toBe('Em andamento');
  });

  test('overrides status to "Aguardando liberação" when the Teste subtask is done but the story is not', () => {
    const activity = mapActivity({
      story: baseStory({ status: 'Em andamento', statusCategory: 'Em andamento' }),
      sprint,
      implStartDate: '2026-08-04',
      implDone: true,
      testDone: true,
      testDoneDate: '2026-09-08',
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.status).toBe('Aguardando liberação');
  });

  test('"Aguardando liberação" takes priority over "Em testes" when both implDone and testDone are true', () => {
    const activity = mapActivity({
      story: baseStory({ statusCategory: 'Em andamento' }),
      sprint,
      implStartDate: '2026-08-04',
      implDone: true,
      testDone: true,
      testDoneDate: '2026-09-08',
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.status).toBe('Aguardando liberação');
  });

  test('keeps the original story status once the story itself is done, even if testDone is true', () => {
    const activity = mapActivity({
      story: baseStory({ status: 'Atendida', statusCategory: 'Concluído' }),
      sprint,
      implStartDate: '2026-08-04',
      testDone: true,
      testDoneDate: '2026-09-08',
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.status).toBe('Atendida');
  });

  test('exposes implDoneDate when implDone is true', () => {
    const activity = mapActivity({
      story: baseStory({ statusCategory: 'Em andamento' }),
      sprint,
      implStartDate: '2026-08-04',
      implDone: true,
      implDoneDate: '2026-09-18',
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.implDoneDate).toBe('2026-09-18');
  });

  test('leaves implDoneDate null when implDone is false, even if a date was provided', () => {
    const activity = mapActivity({
      story: baseStory({ statusCategory: 'Em andamento' }),
      sprint,
      implStartDate: '2026-08-04',
      implDone: false,
      implDoneDate: '2026-09-18',
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.implDoneDate).toBeNull();
  });

  test('defaults implDoneDate to null when not provided', () => {
    const activity = mapActivity({
      story: baseStory({ statusCategory: 'Em andamento' }),
      sprint,
      implStartDate: '2026-08-04',
      implDone: true,
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.implDoneDate).toBeNull();
  });

  test('uses the Teste subtask completion date as deliveredDate when testDone but the story is not formally done', () => {
    const activity = mapActivity({
      story: baseStory({ statusCategory: 'Em andamento', updated: '2026-01-01T00:00:00.000-0300' }),
      sprint,
      implStartDate: '2026-08-04',
      testDone: true,
      testDoneDate: '2026-09-08',
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.deliveredDate).toBe('2026-09-08');
  });

  test('leaves deliveredDate null when testDone is true but testDoneDate is missing', () => {
    const activity = mapActivity({
      story: baseStory({ statusCategory: 'Em andamento' }),
      sprint,
      implStartDate: '2026-08-04',
      testDone: true,
      testDoneDate: null,
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.deliveredDate).toBeNull();
  });

  test('is not overdue once testDone is true, even with an expired dueDate, and exposes testDone', () => {
    const activity = mapActivity({
      story: baseStory({ storyPoints: 10, statusCategory: 'Em andamento' }),
      sprint,
      implStartDate: '2026-08-04', // dueDate falls well before "today", would normally be overdue
      testDone: true,
      testDoneDate: '2026-09-08',
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.isOverdue).toBe(false);
    expect(activity.testDone).toBe(true);
  });

  test('defaults testDone to false and testDoneDate to not affecting deliveredDate when not provided', () => {
    const activity = mapActivity({
      story: baseStory({ statusCategory: 'Em andamento' }),
      sprint,
      implStartDate: '2026-08-04',
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.testDone).toBe(false);
    expect(activity.deliveredDate).toBeNull();
  });

  test('computes implEstimatedHours/testEstimatedHours as the exact 70/30 split of the PF-based estimate', () => {
    const activity = mapActivity({
      story: baseStory({ storyPoints: 10 }),
      sprint,
      implStartDate: '2026-09-04',
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
      hoursPerPf: 5,
      hoursPerDay: 8,
    });
    // estimativa total: 10 PF x 5h/PF = 50h -> split exato: 35h Impl, 15h Teste (não deriva da
    // janela em dias arredondados, que teria dado 5/2 dias x 8h = 40h/16h).
    expect(activity.implEstimatedHours).toBeCloseTo(35);
    expect(activity.testEstimatedHours).toBeCloseTo(15);
  });

  test('leaves implEstimatedHours/testEstimatedHours null when there is no timeline (no estimate)', () => {
    const activity = mapActivity({
      story: baseStory({ storyPoints: null }),
      sprint,
      implStartDate: '2026-08-04',
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.implEstimatedHours).toBeNull();
    expect(activity.testEstimatedHours).toBeNull();
  });

  test('leaves implEstimatedHours/testEstimatedHours null for a notStarted activity, even with an estimate', () => {
    const activity = mapActivity({
      story: baseStory({ storyPoints: 10, statusCategory: 'Novo' }),
      sprint,
      implStartDate: null,
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.implEstimatedHours).toBeNull();
    expect(activity.testEstimatedHours).toBeNull();
  });

  test('passes implLoggedHours, testLoggedHours and worklogEntries through untouched', () => {
    const worklogEntries = [
      { subtaskType: 'Implementação' as const, author: 'Fulano', date: '2026-09-08', hours: 4.25, comment: null },
    ];
    const activity = mapActivity({
      story: baseStory(),
      sprint,
      implStartDate: '2026-08-04',
      implLoggedHours: 4.25,
      testLoggedHours: 0,
      worklogEntries,
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.implLoggedHours).toBe(4.25);
    expect(activity.testLoggedHours).toBe(0);
    expect(activity.worklogEntries).toEqual(worklogEntries);
  });

  test('defaults implLoggedHours, testLoggedHours to null and worklogEntries to an empty array', () => {
    const activity = mapActivity({
      story: baseStory(),
      sprint,
      implStartDate: '2026-08-04',
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.implLoggedHours).toBeNull();
    expect(activity.testLoggedHours).toBeNull();
    expect(activity.worklogEntries).toEqual([]);
  });

  test('flags overdue when dueDate is in the past and status is not done', () => {
    const activity = mapActivity({
      story: baseStory({ storyPoints: 10, statusCategory: 'Em andamento' }),
      sprint,
      implStartDate: '2026-08-04', // dueDate falls well before "today"
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.isOverdue).toBe(true);
  });

  test('never flags a done activity as overdue, even past its dueDate', () => {
    const activity = mapActivity({
      story: baseStory({ storyPoints: 10, statusCategory: 'Concluído', status: 'Atendida' }),
      sprint,
      implStartDate: '2026-08-04',
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.isOverdue).toBe(false);
    expect(activity.isDone).toBe(true);
    expect(activity.deliveredDate).toBe('2026-09-08');
  });

  test('flags a done activity delivered after its dueDate as not on time', () => {
    const activity = mapActivity({
      story: baseStory({ storyPoints: 10, statusCategory: 'Concluído', status: 'Atendida', updated: '2026-09-08T16:37:55.000-0300' }),
      sprint,
      implStartDate: '2026-08-04', // dueDate: 2026-08-14, well before the 08/09 delivery
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.deliveredOnTime).toBe(false);
  });

  test('flags a done activity delivered on or before its dueDate as on time', () => {
    const activity = mapActivity({
      story: baseStory({ storyPoints: 10, statusCategory: 'Concluído', status: 'Atendida', updated: '2026-08-10T16:37:55.000-0300' }),
      sprint,
      implStartDate: '2026-08-04', // dueDate: 2026-08-14
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.deliveredOnTime).toBe(true);
  });

  test('leaves deliveredOnTime null when there is no estimate to project a dueDate', () => {
    const activity = mapActivity({
      story: baseStory({ storyPoints: null, statusCategory: 'Concluído', status: 'Atendida' }),
      sprint,
      implStartDate: '2026-08-04',
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.deliveredOnTime).toBeNull();
  });

  test('leaves deliveredOnTime null for activities not done yet', () => {
    const activity = mapActivity({
      story: baseStory({ storyPoints: 10, statusCategory: 'Em andamento' }),
      sprint,
      implStartDate: '2026-08-04',
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.deliveredOnTime).toBeNull();
  });

  test('computes assertividadePercent from estimated hours vs. hours logged on Implementação + Teste', () => {
    const activity = mapActivity({
      story: baseStory({ storyPoints: 10, statusCategory: 'Concluído', status: 'Atendida' }),
      sprint,
      implStartDate: '2026-09-04',
      implLoggedHours: 5,
      testLoggedHours: 3,
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
      hoursPerPf: 5,
    });
    // estimado: 10 PF x 5h/PF = 50h; apontado: 5h + 3h = 8h -> 8/50 = 16%
    expect(activity.assertividadePercent).toBeCloseTo(16);
  });

  test('keeps assertividadePercent based on Implementação + Teste only, excluding bug hours', () => {
    const activity = mapActivity({
      story: baseStory({ storyPoints: 10, statusCategory: 'Concluído', status: 'Atendida' }),
      sprint,
      implStartDate: '2026-09-04',
      implLoggedHours: 5,
      testLoggedHours: 3,
      bugs: [bug({ worklogEntries: [{ subtaskType: 'Bug', author: 'Fulano', date: '2026-08-28', hours: 12, comment: null }] })],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
      hoursPerPf: 5,
    });
    // estimado: 50h; apontado (sem bugs): 5h + 3h = 8h -> 8/50 = 16%, igual ao teste sem bugs acima
    expect(activity.assertividadePercent).toBeCloseTo(16);
  });

  test('computes assertividadeComBugsPercent including Implementação + Teste + Bugs', () => {
    const activity = mapActivity({
      story: baseStory({ storyPoints: 10, statusCategory: 'Concluído', status: 'Atendida' }),
      sprint,
      implStartDate: '2026-09-04',
      implLoggedHours: 5,
      testLoggedHours: 3,
      bugs: [bug({ worklogEntries: [{ subtaskType: 'Bug', author: 'Fulano', date: '2026-08-28', hours: 12, comment: null }] })],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
      hoursPerPf: 5,
    });
    // estimado: 50h; apontado (com bugs): 5h + 3h + 12h = 20h -> 20/50 = 40%
    expect(activity.assertividadeComBugsPercent).toBeCloseTo(40);
  });

  test('assertividadeComBugsPercent equals assertividadePercent when the activity has no bugs', () => {
    const activity = mapActivity({
      story: baseStory({ storyPoints: 10, statusCategory: 'Concluído', status: 'Atendida' }),
      sprint,
      implStartDate: '2026-09-04',
      implLoggedHours: 5,
      testLoggedHours: 3,
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
      hoursPerPf: 5,
    });
    expect(activity.assertividadeComBugsPercent).toBeCloseTo(activity.assertividadePercent!);
  });

  test('leaves assertividadeComBugsPercent null for activities not done yet, even with bug hours', () => {
    const activity = mapActivity({
      story: baseStory({ storyPoints: 10, statusCategory: 'Em andamento', status: 'Em andamento' }),
      sprint,
      implStartDate: '2026-09-04',
      implLoggedHours: 5,
      bugs: [bug({ worklogEntries: [{ subtaskType: 'Bug', author: 'Fulano', date: '2026-08-28', hours: 12, comment: null }] })],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
      hoursPerPf: 5,
    });
    expect(activity.assertividadeComBugsPercent).toBeNull();
  });

  test('sums implLoggedHours and testLoggedHours even when only one of them has data', () => {
    const activity = mapActivity({
      story: baseStory({ storyPoints: 10, statusCategory: 'Concluído', status: 'Atendida' }),
      sprint,
      implStartDate: '2026-09-04',
      implLoggedHours: 5,
      testLoggedHours: null,
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
      hoursPerPf: 5,
    });
    // estimado: 50h; apontado: 5h (testLoggedHours null tratado como 0) -> 5/50 = 10%
    expect(activity.assertividadePercent).toBeCloseTo(10);
  });

  test('leaves assertividadePercent null when the activity is done but has no logged hours at all', () => {
    const activity = mapActivity({
      story: baseStory({ storyPoints: 10, statusCategory: 'Concluído', status: 'Atendida' }),
      sprint,
      implStartDate: '2026-09-04',
      implLoggedHours: null,
      testLoggedHours: null,
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.assertividadePercent).toBeNull();
  });

  test('leaves assertividadePercent null for an activity in progress, even with hours already logged', () => {
    const activity = mapActivity({
      story: baseStory({ storyPoints: 10, statusCategory: 'Em andamento' }),
      sprint,
      implStartDate: '2026-09-04',
      implLoggedHours: 5,
      testLoggedHours: 0,
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.assertividadePercent).toBeNull();
  });

  test('leaves assertividadePercent null for activities not done yet', () => {
    const activity = mapActivity({
      story: baseStory({ storyPoints: 10, statusCategory: 'Em andamento' }),
      sprint,
      implStartDate: '2026-08-04',
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.assertividadePercent).toBeNull();
  });

  // Implementação + Teste "Atendida" já é trabalho funcionalmente concluído — não devia esperar o
  // fechamento formal da story (status "Aguardando liberação") pra entrar na assertividade.
  test('computes assertividadePercent for an activity awaiting release (testDone), even though the story itself is not formally closed', () => {
    const activity = mapActivity({
      story: baseStory({ storyPoints: 10, statusCategory: 'Em andamento', status: 'Em andamento' }),
      sprint,
      implStartDate: '2026-09-04',
      implLoggedHours: 5,
      testLoggedHours: 3,
      testDone: true,
      testDoneDate: '2026-09-08',
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
      hoursPerPf: 5,
    });
    expect(activity.isDone).toBe(false);
    expect(activity.assertividadePercent).toBeCloseTo(16);
  });

  test('computes assertividadeComBugsPercent for an activity awaiting release (testDone) too', () => {
    const activity = mapActivity({
      story: baseStory({ storyPoints: 10, statusCategory: 'Em andamento', status: 'Em andamento' }),
      sprint,
      implStartDate: '2026-09-04',
      implLoggedHours: 5,
      testLoggedHours: 3,
      testDone: true,
      testDoneDate: '2026-09-08',
      bugs: [bug({ worklogEntries: [{ subtaskType: 'Bug', author: 'Fulano', date: '2026-08-28', hours: 12, comment: null }] })],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
      hoursPerPf: 5,
    });
    expect(activity.assertividadeComBugsPercent).toBeCloseTo(40);
  });

  test('leaves assertividadePercent null when there is no estimate', () => {
    const activity = mapActivity({
      story: baseStory({ storyPoints: null, statusCategory: 'Concluído', status: 'Atendida' }),
      sprint,
      implStartDate: '2026-08-04',
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.assertividadePercent).toBeNull();
  });

  test('normalizes "Concluido" without accent as done too', () => {
    const activity = mapActivity({
      story: baseStory({ statusCategory: 'Concluido' }),
      sprint,
      implStartDate: '2026-08-04',
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.isDone).toBe(true);
  });

  test('passes bugs through untouched', () => {
    const bugs = [
      { key: 'EC-11983', title: 'Bug X', developer: 'Fulano', status: 'Em correção', startDate: '2026-08-27', endDate: '2026-09-03', worklogEntries: [] },
    ];
    const activity = mapActivity({
      story: baseStory(),
      sprint,
      implStartDate: '2026-08-04',
      bugs,
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.bugs).toEqual(bugs);
  });

  test('does not fold bug worklog hours into implLoggedHours — they show separately as bugsLoggedHours', () => {
    const bugs = [
      {
        key: 'EC-11983',
        title: 'Bug X',
        developer: 'Fulano',
        status: 'Em correção',
        startDate: '2026-08-27',
        endDate: '2026-09-03',
        worklogEntries: [
          { subtaskType: 'Bug' as const, author: 'Guilherme Henrique Gibim de Mello', date: '2026-08-28', hours: 2, comment: null },
        ],
      },
    ];
    const activity = mapActivity({
      story: baseStory(), // testador: 'Luana de Souza Bez Batti'
      sprint,
      implStartDate: '2026-08-04',
      implLoggedHours: 5,
      bugs,
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.implLoggedHours).toBe(5);
    expect(activity.testLoggedHours).toBeNull();
    expect(activity.bugsLoggedHours).toBeCloseTo(2);
  });

  test('does not fold bug worklog hours into testLoggedHours either', () => {
    const bugs = [
      {
        key: 'EC-11983',
        title: 'Bug X',
        developer: 'Fulano',
        status: 'Em correção',
        startDate: '2026-08-27',
        endDate: '2026-09-03',
        worklogEntries: [{ subtaskType: 'Bug' as const, author: 'Luana de Souza Bez Batti', date: '2026-08-28', hours: 1.5, comment: null }],
      },
    ];
    const activity = mapActivity({
      story: baseStory(), // testador: 'Luana de Souza Bez Batti'
      sprint,
      implStartDate: '2026-08-04',
      testLoggedHours: 3,
      bugs,
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.testLoggedHours).toBe(3);
    expect(activity.implLoggedHours).toBeNull();
    expect(activity.bugsLoggedHours).toBeCloseTo(1.5);
  });

  test('leaves implLoggedHours/testLoggedHours null when there is no subtask yet, even with bug worklogs', () => {
    const bugs = [
      {
        key: 'EC-11983',
        title: 'Bug X',
        developer: 'Fulano',
        status: 'Em correção',
        startDate: '2026-08-27',
        endDate: '2026-09-03',
        worklogEntries: [{ subtaskType: 'Bug' as const, author: 'Guilherme Henrique Gibim de Mello', date: '2026-08-28', hours: 2, comment: null }],
      },
    ];
    const activity = mapActivity({
      story: baseStory(),
      sprint,
      implStartDate: '2026-08-04',
      bugs,
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.implLoggedHours).toBeNull();
    expect(activity.testLoggedHours).toBeNull();
    expect(activity.bugsLoggedHours).toBeCloseTo(2);
  });

  test('falls back to the story assignee when there is no Implementação subtask to fill "desenvolvedor"', () => {
    const activity = mapActivity({
      story: baseStory({ desenvolvedor: null, assignee: 'Gabriela Camilo Serafim' }),
      sprint,
      implStartDate: null,
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.developer).toBe('Gabriela Camilo Serafim');
  });

  test('defaults developer to "Não atribuído" when neither desenvolvedor nor assignee is set', () => {
    const activity = mapActivity({
      story: baseStory({ desenvolvedor: null, assignee: null }),
      sprint,
      implStartDate: null,
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.developer).toBe('Não atribuído');
  });

  test('defaults tester to null when the story has no testador', () => {
    const activity = mapActivity({
      story: baseStory({ testador: null }),
      sprint,
      implStartDate: '2026-08-04',
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.tester).toBeNull();
  });

  test('leaves bugsLoggedHours null when the activity has no bugs', () => {
    const activity = mapActivity({
      story: baseStory(),
      sprint,
      implStartDate: '2026-08-04',
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.bugsLoggedHours).toBeNull();
  });

  test('sums every worklog entry across all bugs into bugsLoggedHours, regardless of who logged it', () => {
    const activity = mapActivity({
      story: baseStory(),
      sprint,
      implStartDate: '2026-08-04',
      bugs: [
        bug({
          key: 'EC-11983',
          worklogEntries: [
            { subtaskType: 'Bug', author: 'Guilherme Henrique Gibim de Mello', date: '2026-08-28', hours: 2, comment: null },
            { subtaskType: 'Bug', author: 'Luana de Souza Bez Batti', date: '2026-08-29', hours: 1.5, comment: null },
          ],
        }),
        bug({
          key: 'EC-11984',
          worklogEntries: [{ subtaskType: 'Bug', author: 'Guilherme Henrique Gibim de Mello', date: '2026-09-01', hours: 3, comment: null }],
        }),
      ],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.bugsLoggedHours).toBeCloseTo(6.5);
  });

  test('reports 0 (not null) bugsLoggedHours when the activity has bugs but none has a worklog yet', () => {
    const activity = mapActivity({
      story: baseStory(),
      sprint,
      implStartDate: '2026-08-04',
      bugs: [bug({ worklogEntries: [] })],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.bugsLoggedHours).toBe(0);
  });
});
