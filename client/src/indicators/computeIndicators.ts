import type { Activity } from '../types.js';

export interface Kpis {
  totalActivities: number;
  totalStoryPoints: number;
  doneCount: number;
  atRiskCount: number;
  carriedCount: number;
  inProgressOnTimeCount: number;
  openBugsCount: number;
  bugsPerActivity: number;
}

export function computeKpis(activities: Activity[], _today: string): Kpis {
  const totalActivities = activities.length;
  const totalStoryPoints = sum(activities.map((a) => a.storyPoints ?? 0));
  const doneCount = count(activities, (a) => a.isDone);
  const atRiskCount = count(activities, (a) => a.isOverdue);
  const carriedCount = count(activities, (a) => a.isCarried);
  const inProgressOnTimeCount = count(activities, (a) => !a.isDone && !a.isOverdue);
  const openBugsCount = sum(activities.map((a) => a.bugs.length));

  return {
    totalActivities,
    totalStoryPoints,
    doneCount,
    atRiskCount,
    carriedCount,
    inProgressOnTimeCount,
    openBugsCount,
    bugsPerActivity: totalActivities === 0 ? 0 : openBugsCount / totalActivities,
  };
}

export interface RealizedProductivity {
  hoursPerPf: number | null;
  /**
   * % de assertividade agregado: total de horas apontadas (Implementação + Teste) / total de
   * horas estimadas (PF × horas/PF) nas tarefas concluídas. 100% = bateram exatamente; abaixo de
   * 100% superestimamos (levou menos tempo que o previsto); acima de 100% subestimamos (levou
   * mais tempo que o previsto).
   */
  accuracyPercent: number | null;
  /** Mesma % de assertividade, somando também as horas apontadas em bugs (esforço real total). */
  accuracyWithBugsPercent: number | null;
  /** % do total Implementação + Teste que foi de fato Teste, nas tarefas concluídas — compara com o assumedTestSharePercent (hoje fixo em 30%) usado para projetar a janela prevista. Bugs ficam de fora dessa conta. */
  testSharePercent: number | null;
  sampleSize: number;
}

/**
 * Horas por PF e % de assertividade a partir das horas realmente apontadas (worklog de
 * Implementação + Teste) nas tarefas concluídas, ponderadas pelos PFs de cada uma. Indicador
 * "vivo" — muda conforme mais tarefas são concluídas e mais apontamentos são lançados.
 */
export function computeRealizedProductivity(activities: Activity[], hoursPerPf: number): RealizedProductivity {
  // Implementação + Teste "Atendida" (testDone) já é trabalho funcionalmente concluído, mesmo que
  // a story ainda esteja só "Aguardando liberação" — não faz sentido esperar o fechamento formal
  // pra contar horas que já são reais.
  const eligible = activities.filter(
    (a) => (a.isDone || a.testDone) && a.storyPoints !== null && a.storyPoints > 0 && (a.implLoggedHours !== null || a.testLoggedHours !== null),
  );
  const totalStoryPoints = sum(eligible.map((a) => a.storyPoints ?? 0));
  const totalTestHours = sum(eligible.map((a) => a.testLoggedHours ?? 0));
  const totalLoggedHours = sum(eligible.map((a) => (a.implLoggedHours ?? 0) + (a.testLoggedHours ?? 0)));
  const totalLoggedHoursWithBugs = totalLoggedHours + sum(eligible.map((a) => a.bugsLoggedHours ?? 0));
  const totalEstimatedHours = totalStoryPoints * hoursPerPf;

  return {
    hoursPerPf: totalStoryPoints > 0 ? totalLoggedHours / totalStoryPoints : null,
    accuracyPercent: totalEstimatedHours > 0 ? (totalLoggedHours / totalEstimatedHours) * 100 : null,
    accuracyWithBugsPercent: totalEstimatedHours > 0 ? (totalLoggedHoursWithBugs / totalEstimatedHours) * 100 : null,
    testSharePercent: totalLoggedHours > 0 ? (totalTestHours / totalLoggedHours) * 100 : null,
    sampleSize: eligible.length,
  };
}

export interface PersonSummary {
  person: string;
  activities: number;
  storyPoints: number;
  bugs: number;
  done: number;
  atRisk: number;
  inProgress: number;
  noEstimate: number;
}

export function computePersonSummaries(activities: Activity[]): PersonSummary[] {
  const byPerson = new Map<string, PersonSummary>();

  for (const activity of activities) {
    const current = byPerson.get(activity.developer) ?? {
      person: activity.developer,
      activities: 0,
      storyPoints: 0,
      bugs: 0,
      done: 0,
      atRisk: 0,
      inProgress: 0,
      noEstimate: 0,
    };

    current.activities += 1;
    current.storyPoints += activity.storyPoints ?? 0;
    current.bugs += activity.bugs.length;
    if (activity.isDone) current.done += 1;
    if (activity.isOverdue) current.atRisk += 1;
    if (!activity.isDone && !activity.isOverdue) current.inProgress += 1;
    if (activity.storyPoints === null) current.noEstimate += 1;

    byPerson.set(activity.developer, current);
  }

  return [...byPerson.values()].sort((a, b) => b.storyPoints - a.storyPoints);
}

export interface SprintSummary {
  sprintName: string;
  activities: number;
  totalStoryPoints: number;
  bugs: number;
  done: number;
  atRisk: number;
}

export function computeSprintSummaries(activities: Activity[]): SprintSummary[] {
  const bySprint = new Map<string, SprintSummary>();

  for (const activity of activities) {
    const current = bySprint.get(activity.sprintName) ?? {
      sprintName: activity.sprintName,
      activities: 0,
      totalStoryPoints: 0,
      bugs: 0,
      done: 0,
      atRisk: 0,
    };

    current.activities += 1;
    current.totalStoryPoints += activity.storyPoints ?? 0;
    current.bugs += activity.bugs.length;
    if (activity.isDone) current.done += 1;
    if (activity.isOverdue) current.atRisk += 1;

    bySprint.set(activity.sprintName, current);
  }

  return [...bySprint.values()].sort((a, b) => b.totalStoryPoints - a.totalStoryPoints);
}

export interface StatusSummary {
  status: string;
  activities: number;
  storyPoints: number;
  atRisk: number;
}

/** Ordem natural do fluxo de trabalho — status fora dessa lista (tipicamente o status real do Jira
 * quando a atividade está concluída, ex.: "Atendida", "Cancelada") entram depois, por quantidade. */
const STATUS_ORDER = ['Ainda não iniciada', 'Em andamento', 'Ag. início dos testes', 'Em testes', 'Aguardando liberação', 'Correção de bugs'];

function normalizeStatusText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** True quando a atividade tem algum bug ainda não "Atendida" — mesmo critério do badge "Atuando em bugs" da timeline. */
function hasOpenBug(activity: Activity): boolean {
  return activity.bugs.some((bug) => normalizeStatusText(bug.status) !== 'atendida');
}

/**
 * Agrupa atividades pelo mesmo status exibido no badge da timeline: "Ainda não iniciada" quando
 * ainda não há subtarefa de Implementação, senão o status derivado da atividade (que já cobre Em
 * andamento/Ag. início dos testes/Em testes/Aguardando liberação/o status real do Jira quando
 * concluída — ver mapActivity no server).
 */
export function computeStatusSummaries(activities: Activity[]): StatusSummary[] {
  const byStatus = new Map<string, StatusSummary>();

  for (const activity of activities) {
    const status = activity.notStarted
      ? 'Ainda não iniciada'
      : !activity.isDone && hasOpenBug(activity)
        ? 'Correção de bugs'
        : activity.status;
    const current = byStatus.get(status) ?? { status, activities: 0, storyPoints: 0, atRisk: 0 };

    current.activities += 1;
    current.storyPoints += activity.storyPoints ?? 0;
    if (activity.isOverdue) current.atRisk += 1;

    byStatus.set(status, current);
  }

  return [...byStatus.values()].sort((a, b) => {
    const aIndex = STATUS_ORDER.indexOf(a.status);
    const bIndex = STATUS_ORDER.indexOf(b.status);
    if (aIndex !== -1 || bIndex !== -1) {
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    }
    return b.activities - a.activities;
  });
}

/**
 * Reduz a lista de status para no máximo `maxSlices` fatias, somando o restante (os de menor
 * prioridade na ordem já aplicada por `computeStatusSummaries`) numa fatia "Outros" — evita gerar
 * mais cores categóricas do que a paleta suporta com segurança num gráfico de pizza.
 */
export function foldStatusSummariesForChart(summaries: StatusSummary[], maxSlices: number): StatusSummary[] {
  if (summaries.length <= maxSlices) return summaries;

  const kept = summaries.slice(0, maxSlices - 1);
  const rest = summaries.slice(maxSlices - 1);
  const others: StatusSummary = rest.reduce(
    (acc, s) => ({
      status: 'Outros',
      activities: acc.activities + s.activities,
      storyPoints: acc.storyPoints + s.storyPoints,
      atRisk: acc.atRisk + s.atRisk,
    }),
    { status: 'Outros', activities: 0, storyPoints: 0, atRisk: 0 },
  );

  return [...kept, others];
}

export interface TopBuggyActivity {
  key: string;
  title: string;
  sprintName: string;
  developer: string;
  bugCount: number;
}

export function topActivitiesByBugCount(activities: Activity[], limit: number): TopBuggyActivity[] {
  return activities
    .filter((a) => a.bugs.length > 0)
    .map((a) => ({ key: a.key, title: a.title, sprintName: a.sprintName, developer: a.developer, bugCount: a.bugs.length }))
    .sort((a, b) => b.bugCount - a.bugCount)
    .slice(0, limit);
}

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

function count(activities: Activity[], predicate: (a: Activity) => boolean): number {
  return activities.filter(predicate).length;
}
