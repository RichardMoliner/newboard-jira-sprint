import { computeTimeline, DEFAULT_HOURS_PER_PF, DEFAULT_HOURS_PER_DAY } from '../compute/timeline.js';
import { isCarried, isOverdue } from '../compute/status.js';
import type { ParsedSprint } from '../jira/parseSprintField.js';
import type { Activity, BugSubtask } from './types.js';

export interface RawStory {
  key: string;
  summary: string;
  status: string;
  statusCategory: string;
  storyPoints: number | null;
  /** Campo customizado "Desenvolvedor", normalmente preenchido só quando já existe uma subtarefa de Implementação. */
  desenvolvedor: string | null;
  /** Responsável (assignee) padrão da story, usado quando ainda não há subtarefa de Implementação. */
  assignee: string | null;
  testador: string | null;
  created: string;
  updated: string;
}

function dateOnly(isoDateTime: string): string {
  return isoDateTime.slice(0, 10);
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function isDoneStatusCategory(statusCategory: string): boolean {
  return normalize(statusCategory) === 'concluido';
}

export function mapActivity(params: {
  story: RawStory;
  sprint: ParsedSprint;
  implStartDate: string | null;
  bugs: BugSubtask[];
  baseUrl: string;
  today: string;
  hoursPerPf?: number;
  hoursPerDay?: number;
}): Activity {
  const {
    story,
    sprint,
    implStartDate,
    bugs,
    baseUrl,
    today,
    hoursPerPf = DEFAULT_HOURS_PER_PF,
    hoursPerDay = DEFAULT_HOURS_PER_DAY,
  } = params;

  const startDate = implStartDate ?? dateOnly(story.created);
  const isDone = isDoneStatusCategory(story.statusCategory);
  const deliveredDate = isDone ? dateOnly(story.updated) : null;

  const timeline = story.storyPoints !== null ? computeTimeline(story.storyPoints, startDate, hoursPerPf, hoursPerDay) : null;
  const dueDate = timeline?.test.end ?? null;

  return {
    key: story.key,
    url: `${baseUrl}/browse/${story.key}`,
    title: story.summary,
    sprintId: sprint.id,
    sprintName: sprint.name,
    isCarried: isCarried(startDate, sprint.startDate),
    developer: story.desenvolvedor ?? story.assignee ?? 'Não atribuído',
    tester: story.testador,
    storyPoints: story.storyPoints,
    startDate,
    dueDate,
    deliveredDate,
    status: story.status,
    isDone,
    isOverdue: isOverdue(dueDate, isDone, today),
    implWindow: timeline?.impl ?? null,
    testWindow: timeline?.test ?? null,
    bugs,
  };
}
