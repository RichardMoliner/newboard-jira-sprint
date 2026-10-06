import { computeTimeline, DEFAULT_HOURS_PER_PF, DEFAULT_HOURS_PER_DAY } from '../compute/timeline.js';
import { isCarried, isOverdue, isDeliveredOnTime, isAddedAfterSprintStart } from '../compute/status.js';
import { computeAccuracyPercent } from '../compute/accuracy.js';
import type { ParsedSprint } from '../jira/parseSprintField.js';
import type { DeveloperRole } from '../jira/inferRoles.js';
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
  /** Rótulos (labels) da story. */
  labels?: string[];
}

/** Rótulo usado pra marcar tarefas que podem ficar de fora de um deploy sem bloquear a publicação. */
const NOT_IMPACTS_DEPLOY_LABEL = 'não-impacta-deploy';

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

/**
 * Separa os apontamentos de bug em horas de Impl./Teste conforme o papel (dev ou tester) de quem
 * apontou. Quem apontou mas não tem papel conhecido (não foi responsável por nenhuma subtarefa de
 * Implementação/Teste na sprint) não entra em nenhum dos dois — só no total `bugsLoggedHours`.
 */
function splitBugWorklogHoursByRole(
  bugs: BugSubtask[],
  developerRoles: Map<string, DeveloperRole>,
): { implBugsLoggedHours: number; testBugsLoggedHours: number } {
  let implHours = 0;
  let testHours = 0;
  for (const bug of bugs) {
    for (const entry of bug.worklogEntries) {
      const role = developerRoles.get(entry.author);
      if (role === 'dev') implHours += entry.hours;
      else if (role === 'tester') testHours += entry.hours;
    }
  }
  return { implBugsLoggedHours: implHours, testBugsLoggedHours: testHours };
}

export function mapActivity(params: {
  story: RawStory;
  sprint: ParsedSprint;
  implStartDate: string | null;
  implDone?: boolean;
  implDoneDate?: string | null;
  testDone?: boolean;
  testDoneDate?: string | null;
  implLoggedHours?: number | null;
  testLoggedHours?: number | null;
  worklogEntries?: WorklogEntry[];
  bugs: BugSubtask[];
  /** Papel (dev/tester) de cada pessoa na sprint, usado para separar as horas de bug entre Impl./Teste. */
  developerRoles?: Map<string, DeveloperRole>;
  /** Timestamp ISO de quando a issue entrou na sprint atual (via changelog do Jira); null sem esse histórico. */
  sprintEnteredAt?: string | null;
  /** Timestamp ISO de quando a issue transicionou pro status atual (via changelog do Jira); usado
   * como deliveredDate quando a story está concluída, em vez de `story.updated` (que pode ter sido
   * tocado bem depois da entrega real, por algo sem relação). Null sem esse histórico. */
  doneTransitionDate?: string | null;
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
    implDoneDate = null,
    testDone = false,
    testDoneDate = null,
    implLoggedHours = null,
    testLoggedHours = null,
    worklogEntries = [],
    bugs,
    developerRoles = new Map(),
    sprintEnteredAt = null,
    doneTransitionDate = null,
    baseUrl,
    today,
    hoursPerPf = DEFAULT_HOURS_PER_PF,
    hoursPerDay = DEFAULT_HOURS_PER_DAY,
  } = params;

  const startDate = implStartDate ?? dateOnly(story.created);
  const isDone = isDoneStatusCategory(story.statusCategory);
  // Sem a story formalmente concluída no Jira, mas com a subtarefa de Teste já atendida, usamos a
  // data dela como entrega — o trabalho terminou de fato, só falta a liberação/fechamento formal.
  // Concluída: prioriza a data real da transição pro status atual (changelog) — `story.updated`
  // pode ter sido tocado bem depois da entrega de fato, por algo sem relação (ex.: campo mexido em
  // lote), inflando a data. Sem esse histórico, cai pro `story.updated` como antes.
  const deliveredDate = isDone
    ? dateOnly(doneTransitionDate ?? story.updated)
    : testDone && testDoneDate !== null
      ? testDoneDate
      : null;
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
  const { implBugsLoggedHours, testBugsLoggedHours } =
    bugs.length > 0 ? splitBugWorklogHoursByRole(bugs, developerRoles) : { implBugsLoggedHours: null, testBugsLoggedHours: null };

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

  const carried = notStarted ? false : isCarried(startDate, sprint.startDate);

  return {
    key: story.key,
    url: `${baseUrl}/browse/${story.key}`,
    title: story.summary,
    sprintId: sprint.id,
    sprintName: sprint.name,
    isCarried: carried,
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
    implDoneDate: implDone ? implDoneDate : null,
    testDone,
    implWindow: timeline?.impl ?? null,
    testWindow: timeline?.test ?? null,
    implEstimatedHours,
    testEstimatedHours,
    implLoggedHours,
    testLoggedHours,
    bugsLoggedHours,
    implBugsLoggedHours,
    testBugsLoggedHours,
    worklogEntries,
    bugs,
    addedAfterSprintStart: isAddedAfterSprintStart(carried, sprintEnteredAt, sprint.startDateTime),
    sprintEnteredAt,
    notImpactsDeploy: (story.labels ?? []).includes(NOT_IMPACTS_DEPLOY_LABEL),
  };
}
