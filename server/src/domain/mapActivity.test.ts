import { describe, expect, test } from 'vitest';
import { mapActivity, type RawStory } from './mapActivity.js';
import type { ParsedSprint } from '../jira/parseSprintField.js';

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

  test('overrides status to "Em testes" when the Implementação subtask is done but the story is not', () => {
    const activity = mapActivity({
      story: baseStory({ status: 'Em andamento', statusCategory: 'Em andamento' }),
      sprint,
      implStartDate: '2026-08-04',
      implDone: true,
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.status).toBe('Em testes');
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

  test('computes implEstimatedHours/testEstimatedHours from the projected windows', () => {
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
    // pfPerDay = 8/5 = 1.6; totalBusinessDays = ceil(10/1.6) = 7; implSteps = round(7*0.7) = 5; testSteps = 2
    expect(activity.implEstimatedHours).toBeCloseTo(5 * 8);
    expect(activity.testEstimatedHours).toBeCloseTo(2 * 8);
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

  test('leaves deliveredOnTime and realizedBusinessDays null for activities not done yet', () => {
    const activity = mapActivity({
      story: baseStory({ storyPoints: 10, statusCategory: 'Em andamento' }),
      sprint,
      implStartDate: '2026-08-04',
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.deliveredOnTime).toBeNull();
    expect(activity.realizedBusinessDays).toBeNull();
  });

  test('computes realizedBusinessDays as the business days between startDate and deliveredDate', () => {
    const activity = mapActivity({
      story: baseStory({ storyPoints: 10, statusCategory: 'Concluído', status: 'Atendida', updated: '2026-09-08T16:37:55.000-0300' }),
      sprint,
      implStartDate: '2026-09-04', // Friday; deliveredDate 2026-09-08 (Tuesday, after the 05-07/09 weekend+holiday)
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
    });
    expect(activity.deliveredDate).toBe('2026-09-08');
    expect(activity.realizedBusinessDays).toBe(1);
  });

  test('computes assertividadePercent from estimated vs realized hours for a done activity', () => {
    const activity = mapActivity({
      story: baseStory({ storyPoints: 10, statusCategory: 'Concluído', status: 'Atendida', updated: '2026-09-08T16:37:55.000-0300' }),
      sprint,
      implStartDate: '2026-09-04', // realizedBusinessDays: 1
      bugs: [],
      baseUrl: 'https://desenv.betha.com.br',
      today: '2026-09-08',
      hoursPerPf: 5,
      hoursPerDay: 8,
    });
    // estimado: 10 PF x 5h/PF = 50h; realizado: 1 dia útil x 8h/dia = 8h -> 8/50 = 16%
    expect(activity.assertividadePercent).toBeCloseTo(16);
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
      { key: 'EC-11983', title: 'Bug X', developer: 'Fulano', status: 'Em correção', startDate: '2026-08-27', endDate: '2026-09-03' },
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
});
