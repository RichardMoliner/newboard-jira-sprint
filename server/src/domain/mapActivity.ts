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

/**
 * Soma os apontamentos lançados nos bugs da atividade nas horas de Implementação/Teste: quem
 * apontou é comparado com o tester da story — apontamentos do tester contam como Teste, os de
 * qualquer outra pessoa (dev incluído) contam como Implementação.
 */
function sumBugWorklogHours(bugs: BugSubtask[], testerName: string | null): { implHours: number; testHours: number } {
  const normalizedTester = testerName !== null ? normalize(testerName) : null;
  let implHours = 0;
  let testHours = 0;
  for (const bug of bugs) {
    for (const entry of bug.worklogEntries) {
      if (normalizedTester !== null && normalize(entry.author) === normalizedTester) {
        testHours += entry.hours;
      } else {
        implHours += entry.hours;
      }
    }
  }
  return { implHours, testHours };
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
  // Progressão do status conforme as subtarefas avançam, quando o status do Jira ainda não reflete isso:
  // Teste atendida -> aguardando liberação; só Implementação atendida -> em testes; senão, status real.
  const status = isDone ? story.status : testDone ? 'Aguardando liberação' : implDone ? 'Em testes' : story.status;

  const timeline =
    !notStarted && story.storyPoints !== null ? computeTimeline(story.storyPoints, startDate, hoursPerPf, hoursPerDay) : null;
  const dueDate = timeline?.test.end ?? null;
  // Horas úteis previstas por fase (dias úteis da janela × horas produtivas/dia) — mesma conta já
  // usada no tooltip de PF, agora exposta como campo para comparar com o apontado (worklog).
  const implEstimatedHours = timeline ? businessDaysBetween(timeline.impl.start, timeline.impl.end) * hoursPerDay : null;
  const testEstimatedHours = timeline ? businessDaysBetween(timeline.test.start, timeline.test.end) * hoursPerDay : null;

  // Apontamentos nos bugs somam nas horas de Implementação/Teste da atividade — refletem o
  // trabalho real de corrigir/validar os bugs encontrados, não só o das subtarefas principais.
  const { implHours: bugImplHours, testHours: bugTestHours } = sumBugWorklogHours(bugs, story.testador);
  const combinedImplLoggedHours =
    implLoggedHours !== null || bugImplHours > 0 ? (implLoggedHours ?? 0) + bugImplHours : null;
  const combinedTestLoggedHours =
    testLoggedHours !== null || bugTestHours > 0 ? (testLoggedHours ?? 0) + bugTestHours : null;

  // Assertividade compara o estimado (PF × horas/PF) com o realmente apontado (Implementação +
  // Teste + bugs) — só faz sentido depois que a story está concluída (apontamento fechado).
  const totalLoggedHours =
    combinedImplLoggedHours !== null || combinedTestLoggedHours !== null
      ? (combinedImplLoggedHours ?? 0) + (combinedTestLoggedHours ?? 0)
      : null;
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
    implLoggedHours: combinedImplLoggedHours,
    testLoggedHours: combinedTestLoggedHours,
    worklogEntries,
    bugs,
  };
}
