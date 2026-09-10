import { computeTimeline, DEFAULT_HOURS_PER_PF, DEFAULT_HOURS_PER_DAY } from '../compute/timeline.js';
import { isCarried, isOverdue, isDeliveredOnTime } from '../compute/status.js';
import { businessDaysBetween } from '../compute/businessDays.js';
import { computeAccuracyPercent } from '../compute/accuracy.js';
import type { ParsedSprint } from '../jira/parseSprintField.js';
import type { Activity, BugSubtask, WorklogEntry } from './types.js';

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
  implDone?: boolean;
  implLoggedHours?: number | null;
  testLoggedHours?: number | null;
  worklogEntries?: WorklogEntry[];
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
    implDone = false,
    implLoggedHours = null,
    testLoggedHours = null,
    worklogEntries = [],
    bugs,
    baseUrl,
    today,
    hoursPerPf = DEFAULT_HOURS_PER_PF,
    hoursPerDay = DEFAULT_HOURS_PER_DAY,
  } = params;

  const startDate = implStartDate ?? dateOnly(story.created);
  const isDone = isDoneStatusCategory(story.statusCategory);
  const deliveredDate = isDone ? dateOnly(story.updated) : null;
  // Sem subtarefa de Implementação ainda e não concluída: `startDate` é só a data de criação da
  // story, não um início real — não dá pra projetar prazo nem considerar herdada a partir dela.
  const notStarted = !isDone && implStartDate === null;
  // Subtarefa de Implementação atendida mas a story ainda não foi marcada como concluída: o
  // trabalho de fato já passou para a fase de testes, mesmo que o status do Jira ainda não reflita isso.
  const status = !isDone && implDone ? 'Em testes' : story.status;

  const timeline =
    !notStarted && story.storyPoints !== null ? computeTimeline(story.storyPoints, startDate, hoursPerPf, hoursPerDay) : null;
  const dueDate = timeline?.test.end ?? null;
  // Horas úteis previstas por fase (dias úteis da janela × horas produtivas/dia) — mesma conta já
  // usada no tooltip de PF, agora exposta como campo para comparar com o apontado (worklog).
  const implEstimatedHours = timeline ? businessDaysBetween(timeline.impl.start, timeline.impl.end) * hoursPerDay : null;
  const testEstimatedHours = timeline ? businessDaysBetween(timeline.test.start, timeline.test.end) * hoursPerDay : null;
  // Assertividade compara o estimado (PF × horas/PF) com o realmente apontado nas subtarefas de
  // Implementação/Teste — só faz sentido depois que a story está concluída (apontamento fechado).
  const totalLoggedHours =
    implLoggedHours !== null || testLoggedHours !== null ? (implLoggedHours ?? 0) + (testLoggedHours ?? 0) : null;
  const assertividadePercent =
    isDone && story.storyPoints !== null && totalLoggedHours !== null
      ? computeAccuracyPercent(story.storyPoints * hoursPerPf, totalLoggedHours)
      : null;

  return {
    key: story.key,
    url: `${baseUrl}/browse/${story.key}`,
    title: story.summary,
    sprintId: sprint.id,
    sprintName: sprint.name,
    isCarried: notStarted ? false : isCarried(startDate, sprint.startDate),
    developer: story.desenvolvedor ?? story.assignee ?? 'Não atribuído',
    tester: story.testador,
    storyPoints: story.storyPoints,
    startDate,
    dueDate,
    deliveredDate,
    deliveredOnTime: isDeliveredOnTime(deliveredDate, dueDate),
    assertividadePercent,
    status,
    isDone,
    isOverdue: isOverdue(dueDate, isDone, today),
    notStarted,
    implDone,
    implWindow: timeline?.impl ?? null,
    testWindow: timeline?.test ?? null,
    implEstimatedHours,
    testEstimatedHours,
    implLoggedHours,
    testLoggedHours,
    worklogEntries,
    bugs,
  };
}
