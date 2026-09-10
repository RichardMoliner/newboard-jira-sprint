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
