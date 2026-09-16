import { computeTimeline, DEFAULT_HOURS_PER_PF, DEFAULT_HOURS_PER_DAY } from '../compute/timeline.js';
import { isCarried, isOverdue, isDeliveredOnTime } from '../compute/status.js';
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

/** Soma todos os apontamentos lançados nos bugs da atividade, de qualquer pessoa. */
function sumBugWorklogHours(bugs: BugSubtask[]): number {
  let total = 0;
  for (const bug of bugs) {
    for (const entry of bug.worklogEntries) {
      total += entry.hours;
    }
  }
  return total;
}

export function mapActivity(params: {
  story: RawStory;
  sprint: ParsedSprint;
  implStartDate: string | null;
  implDone?: boolean;
  testDone?: boolean;
  testDoneDate?: string | null;
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
    testDone = false,
    testDoneDate = null,
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
  // Sem a story formalmente concluída no Jira, mas com a subtarefa de Teste já atendida, usamos a
  // data dela como entrega — o trabalho terminou de fato, só falta a liberação/fechamento formal.
  const deliveredDate = isDone ? dateOnly(story.updated) : testDone && testDoneDate !== null ? testDoneDate : null;
  // Sem subtarefa de Implementação ainda e não concluída: `startDate` é só a data de criação da
  // story, não um início real — não dá pra projetar prazo nem considerar herdada a partir dela.
  const notStarted = !isDone && implStartDate === null;
  // Implementação atendida mas o teste ainda não tem nenhum apontamento: o teste ainda não começou
  // de fato, então fica "aguardando início" em vez de "em testes".
  const hasTestWorklog = worklogEntries.some((entry) => entry.subtaskType === 'Teste');
  // Progressão do status conforme as subtarefas avançam, quando o status do Jira ainda não reflete isso:
  // Teste atendida -> aguardando liberação; Implementação atendida com apontamento de teste -> em
  // testes; Implementação atendida sem apontamento de teste ainda -> aguardando início dos testes.
  const status = isDone
    ? story.status
    : testDone
      ? 'Aguardando liberação'
      : implDone
        ? hasTestWorklog
          ? 'Em testes'
          : 'Ag. início dos testes'
        : story.status;

  const timeline =
    !notStarted && story.storyPoints !== null ? computeTimeline(story.storyPoints, startDate, hoursPerPf, hoursPerDay) : null;
  const dueDate = timeline?.test.end ?? null;
  // Horas previstas por fase — a fração exata (70/30) da estimativa (PF × horas/PF), não derivada
  // da janela em dias já arredondada (que pode fugir bastante do 70/30 em tarefas pequenas).
  const implEstimatedHours = timeline?.implEstimatedHours ?? null;
  const testEstimatedHours = timeline?.testEstimatedHours ?? null;

  // Apontamentos em bugs contam à parte (campo "Bugs (h)") — não entram nas horas de
  // Implementação/Teste, que mostram só o que foi apontado na própria subtarefa.
  const bugsLoggedHours = bugs.length > 0 ? sumBugWorklogHours(bugs) : null;

  // Duas assertividades: uma só com o trabalho planejado (Implementação + Teste, contra a
  // estimativa original) e outra somando também os bugs (esforço real total, incluindo correções
  // não previstas na estimativa). Consideram o trabalho funcionalmente concluído — Teste já
  // "Atendida" — mesmo que a story ainda não tenha sido formalmente fechada (só aguardando
  // liberação): não faz sentido esperar esse trâmite pra contar horas que já são reais.
  const functionallyDone = isDone || testDone;
  const totalLoggedHoursNoBugs =
    implLoggedHours !== null || testLoggedHours !== null ? (implLoggedHours ?? 0) + (testLoggedHours ?? 0) : null;
  const totalLoggedHoursWithBugs =
    totalLoggedHoursNoBugs !== null || bugsLoggedHours !== null ? (totalLoggedHoursNoBugs ?? 0) + (bugsLoggedHours ?? 0) : null;
  const assertividadePercent =
    functionallyDone && story.storyPoints !== null && totalLoggedHoursNoBugs !== null
      ? computeAccuracyPercent(story.storyPoints * hoursPerPf, totalLoggedHoursNoBugs)
      : null;
  const assertividadeComBugsPercent =
    functionallyDone && story.storyPoints !== null && totalLoggedHoursWithBugs !== null
      ? computeAccuracyPercent(story.storyPoints * hoursPerPf, totalLoggedHoursWithBugs)
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
    assertividadeComBugsPercent,
    status,
    isDone,
    // Uma vez que os testes já foram atendidos, a tarefa não está mais "atrasada" de fato — só
    // aguardando liberação/fechamento formal.
    isOverdue: isOverdue(dueDate, isDone || testDone, today),
    notStarted,
    implDone,
    testDone,
    implWindow: timeline?.impl ?? null,
    testWindow: timeline?.test ?? null,
    implEstimatedHours,
    testEstimatedHours,
    implLoggedHours,
    testLoggedHours,
    bugsLoggedHours,
    worklogEntries,
    bugs,
  };
}
