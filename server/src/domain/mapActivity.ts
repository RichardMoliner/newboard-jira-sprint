import { computeTimeline } from '../compute/timeline.js';
import { isCarried, isOverdue } from '../compute/status.js';
import type { ParsedSprint } from '../jira/parseSprintField.js';
import type { Activity, BugSubtask } from './types.js';

export interface RawStory {
  key: string;
  summary: string;
  status: string;
  statusCategory: string;
  storyPoints: number | null;
  desenvolvedor: string;
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
}): Activity {
  const { story, sprint, implStartDate, bugs, baseUrl, today } = params;

  const startDate = implStartDate ?? dateOnly(story.created);
  const isDone = isDoneStatusCategory(story.statusCategory);
  const deliveredDate = isDone ? dateOnly(story.updated) : null;

  const timeline = story.storyPoints !== null ? computeTimeline(story.storyPoints, startDate) : null;
  const dueDate = timeline?.test.end ?? null;

  return {
    key: story.key,
    url: `${baseUrl}/browse/${story.key}`,
    title: story.summary,
    sprintId: sprint.id,
    sprintName: sprint.name,
    isCarried: isCarried(startDate, sprint.startDate),
    developer: story.desenvolvedor,
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
