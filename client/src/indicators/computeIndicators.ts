import type { Activity, SprintInfo } from '../types.js';
import { listBusinessDays } from '../businessDays.js';

export interface Kpis {
  totalActivities: number;
  totalStoryPoints: number;
  doneCount: number;
  atRiskCount: number;
  carriedCount: number;
  inProgressOnTimeCount: number;
  openBugsCount: number;
  bugsPerActivity: number;
  /** Bugs cujo "Artefato do bug" (Jira) é Requisito — gerados no requisito/produto. */
  bugsRequisitoCount: number;
  /** Bugs cujo "Artefato do bug" (Jira) é Solução — gerados na implementação/dev. */
  bugsImplementacaoCount: number;
  /** Atividades que entraram na sprint atual depois que ela já tinha começado (exclui herdadas). */
  addedLateCount: number;
  /** Soma dos Story Points dessas atividades; null vira 0 na soma. */
  addedLateStoryPoints: number;
}

export function computeKpis(activities: Activity[], _today: string): Kpis {
  const totalActivities = activities.length;
  const totalStoryPoints = sum(activities.map((a) => a.storyPoints ?? 0));
  const doneCount = count(activities, isCompleted);
  const atRiskCount = count(activities, (a) => a.isOverdue);
  const carriedCount = count(activities, (a) => a.isCarried);
  const inProgressOnTimeCount = count(activities, (a) => !isCompleted(a) && !a.isOverdue);
  const openBugsCount = sum(activities.map((a) => a.bugs.length));
  const allBugs = activities.flatMap((a) => a.bugs);
  const bugsRequisitoCount = allBugs.filter((b) => b.artifact === 'requisito').length;
  const bugsImplementacaoCount = allBugs.filter((b) => b.artifact === 'implementacao').length;
  const addedLate = activities.filter((a) => a.addedAfterSprintStart);

  return {
    totalActivities,
    totalStoryPoints,
    doneCount,
    atRiskCount,
    carriedCount,
    inProgressOnTimeCount,
    openBugsCount,
    bugsRequisitoCount,
    bugsImplementacaoCount,
    bugsPerActivity: totalActivities === 0 ? 0 : openBugsCount / totalActivities,
    addedLateCount: addedLate.length,
    addedLateStoryPoints: sum(addedLate.map((a) => a.storyPoints ?? 0)),
  };
}

export interface RealizedProductivity {
  hoursPerPf: number | null;
  /** Mesma média, olhando só as horas de Implementação sobre o PF dedicado à Implementação (fração `100 - assumedTestSharePercent`). */
  hoursPerPfImpl: number | null;
  /** Mesma média, olhando só as horas de Teste sobre o PF dedicado ao Teste (fração `assumedTestSharePercent`). */
  hoursPerPfTest: number | null;
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
export function computeRealizedProductivity(
  activities: Activity[],
  hoursPerPf: number,
  assumedTestSharePercent: number,
): RealizedProductivity {
  // Implementação + Teste "Atendida" (testDone) já é trabalho funcionalmente concluído, mesmo que
  // a story ainda esteja só "Aguardando liberação" — não faz sentido esperar o fechamento formal
  // pra contar horas que já são reais.
  const eligible = activities.filter(
    (a) => (a.isDone || a.testDone) && a.storyPoints !== null && a.storyPoints > 0 && (a.implLoggedHours !== null || a.testLoggedHours !== null),
  );
  const implSharePercent = 100 - assumedTestSharePercent;
  const totalStoryPoints = sum(eligible.map((a) => a.storyPoints ?? 0));
  const totalImplHours = sum(eligible.map((a) => a.implLoggedHours ?? 0));
  const totalTestHours = sum(eligible.map((a) => a.testLoggedHours ?? 0));
  const totalLoggedHours = totalImplHours + totalTestHours;
  const totalLoggedHoursWithBugs = totalLoggedHours + sum(eligible.map((a) => a.bugsLoggedHours ?? 0));
  const totalEstimatedHours = totalStoryPoints * hoursPerPf;
  const totalPfImpl = totalStoryPoints * (implSharePercent / 100);
  const totalPfTest = totalStoryPoints * (assumedTestSharePercent / 100);

  return {
    hoursPerPf: totalStoryPoints > 0 ? totalLoggedHours / totalStoryPoints : null,
    hoursPerPfImpl: totalPfImpl > 0 ? totalImplHours / totalPfImpl : null,
    hoursPerPfTest: totalPfTest > 0 ? totalTestHours / totalPfTest : null,
    accuracyPercent: totalEstimatedHours > 0 ? (totalLoggedHours / totalEstimatedHours) * 100 : null,
    accuracyWithBugsPercent: totalEstimatedHours > 0 ? (totalLoggedHoursWithBugs / totalEstimatedHours) * 100 : null,
    testSharePercent: totalLoggedHours > 0 ? (totalTestHours / totalLoggedHours) * 100 : null,
    sampleSize: eligible.length,
  };
}

export interface HoursPerPfSummary {
  developer: string;
  /** PF dedicados à Implementação — Story Points × implSharePercent/100, somados de todas as tarefas do dev. */
  pfImpl: number;
  /** Horas de Implementação apontadas, somadas de todas as tarefas do dev (concluídas ou não). */
  implHours: number;
  /** implHours / pfImpl; null quando o dev não tem PF de Implementação nenhum para dividir (evita dividir por zero). */
  hoursPerPf: number | null;
}

/**
 * Horas de Implementação apontadas por PF de Implementação, por desenvolvedor — considera TODAS as
 * tarefas (não só as concluídas), usando a fração de PF atribuída à Implementação (`implSharePercent`,
 * hoje 70% — vem de `assumedTestSharePercent` do board-data, para não fixar o percentual no client).
 */
export function computeHoursPerPfByDeveloper(activities: Activity[], implSharePercent: number): HoursPerPfSummary[] {
  const byDeveloper = new Map<string, { pfImpl: number; implHours: number }>();

  for (const activity of activities) {
    const current = byDeveloper.get(activity.developer) ?? { pfImpl: 0, implHours: 0 };
    current.pfImpl += (activity.storyPoints ?? 0) * (implSharePercent / 100);
    current.implHours += activity.implLoggedHours ?? 0;
    byDeveloper.set(activity.developer, current);
  }

  return [...byDeveloper.entries()]
    .map(([developer, { pfImpl, implHours }]) => ({
      developer,
      pfImpl,
      implHours,
      hoursPerPf: pfImpl > 0 ? implHours / pfImpl : null,
    }))
    .sort((a, b) => (a.hoursPerPf ?? Infinity) - (b.hoursPerPf ?? Infinity));
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
    if (isCompleted(activity)) current.done += 1;
    if (activity.isOverdue) current.atRisk += 1;
    if (!isCompleted(activity) && !activity.isOverdue) current.inProgress += 1;
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
    if (isCompleted(activity)) current.done += 1;
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
const STATUS_ORDER = ['Ainda não iniciada', 'Em andamento', 'Ag. início dos testes', 'Em testes', 'Aguardando liberação'];

/**
 * Agrupa atividades pelo mesmo status exibido no badge da timeline: "Ainda não iniciada" quando
 * ainda não há subtarefa de Implementação, senão o status derivado da atividade (que já cobre Em
 * andamento/Ag. início dos testes/Em testes/Aguardando liberação/o status real do Jira quando
 * concluída — ver mapActivity no server). Não reclassifica por ter bug aberto: o badge da timeline
 * nunca muda por causa de bug, então a pizza também não deve mudar — senão a contagem de um status
 * (ex.: "Aguardando liberação") deixa de bater com a lista de atividades.
 */
export function computeStatusSummaries(activities: Activity[]): StatusSummary[] {
  const byStatus = new Map<string, StatusSummary>();

  for (const activity of activities) {
    const status = activity.notStarted ? 'Ainda não iniciada' : activity.status;
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

export interface BugLabelSummary {
  label: string;
  count: number;
}

/**
 * Conta ocorrências de cada rótulo (label) de bug em todas as atividades — um bug com mais de um
 * rótulo conta uma vez em cada, então a soma pode passar do total de bugs (não é mutuamente
 * exclusivo, ao contrário de status ou artefato).
 */
export function computeBugLabelSummaries(activities: Activity[]): BugLabelSummary[] {
  const countByLabel = new Map<string, number>();
  for (const bug of activities.flatMap((a) => a.bugs)) {
    for (const label of bug.labels) {
      countByLabel.set(label, (countByLabel.get(label) ?? 0) + 1);
    }
  }
  return [...countByLabel.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

export interface HoursSummary {
  /** Story points totais × horas/PF configurado — quanto se previu de esforço para o escopo atual. */
  plannedHours: number;
  /** Fatia de `plannedHours` prevista para Implementação (100% − assumedTestSharePercent). */
  plannedImplHours: number;
  /** Fatia de `plannedHours` prevista para Teste (assumedTestSharePercent). */
  plannedTestHours: number;
  /** Soma das horas apontadas em Implementação + Teste (subtarefas, sem bugs). */
  executedHours: number;
  /** Soma só das horas apontadas em Implementação. */
  executedImplHours: number;
  /** Soma só das horas apontadas em Teste. */
  executedTestHours: number;
  /** Soma das horas de bug apontadas por quem tem papel de dev na sprint (ver `inferRoles` no servidor). */
  bugFixHours: number;
  /** Soma das horas de bug apontadas por quem tem papel de tester na sprint. */
  bugTestHours: number;
}

export function computeHoursSummary(activities: Activity[], hoursPerPf: number, assumedTestSharePercent: number): HoursSummary {
  const totalStoryPoints = sum(activities.map((a) => a.storyPoints ?? 0));
  const plannedHours = totalStoryPoints * hoursPerPf;
  const executedImplHours = sum(activities.map((a) => a.implLoggedHours ?? 0));
  const executedTestHours = sum(activities.map((a) => a.testLoggedHours ?? 0));
  const bugFixHours = sum(activities.map((a) => a.implBugsLoggedHours ?? 0));
  const bugTestHours = sum(activities.map((a) => a.testBugsLoggedHours ?? 0));

  return {
    plannedHours,
    plannedImplHours: plannedHours * ((100 - assumedTestSharePercent) / 100),
    plannedTestHours: plannedHours * (assumedTestSharePercent / 100),
    executedHours: executedImplHours + executedTestHours,
    executedImplHours,
    executedTestHours,
    bugFixHours,
    bugTestHours,
  };
}

/** "Concluída" nos indicadores = Concluída de fato OU Aguardando liberação (Teste já atendido) —
 * mesmo critério "funcionalmente concluída" usado na Assertividade e nos botões de sprint. */
function isCompleted(activity: Activity): boolean {
  return activity.isDone || activity.testDone;
}

export interface BurndownPoint {
  date: string;
  /** Restante previsto, numa reta do total até 0 ao longo dos dias úteis da sprint. */
  ideal: number;
  /** Restante real (total − SP já entregues até esse dia); null para dias futuros, ainda não conhecidos. */
  actual: number | null;
}

export interface BurndownData {
  totalStoryPoints: number;
  points: BurndownPoint[];
}

/**
 * Reconstrói o burndown a partir da data de entrega de cada atividade (deliveredDate, quando
 * funcionalmente concluída) — o painel não guarda um histórico diário real do backlog. Combina
 * todas as sprints selecionadas num único período (do início mais cedo ao fim mais tarde) e um
 * único total; sempre conta todas as atividades recebidas, independente de herdada ou da checkbox
 * "Considerar herdadas" (é sobre o escopo real da sprint, não uma métrica de produtividade — mesmo
 * racional dos cards "Em risco"/"Herdadas"). Retorna null sem nenhuma sprint selecionada.
 */
export function computeBurndown(activities: Activity[], sprints: SprintInfo[], sprintFilter: string[], today: string): BurndownData | null {
  if (sprintFilter.length === 0) return null;
  const selectedSprints = sprints.filter((s) => sprintFilter.includes(s.id));
  if (selectedSprints.length === 0) return null;

  const startDate = selectedSprints.map((s) => s.startDate).sort()[0];
  const endDate = selectedSprints.map((s) => s.endDate).sort().slice(-1)[0];

  const totalStoryPoints = sum(activities.map((a) => a.storyPoints ?? 0));
  const days = listBusinessDays(startDate, endDate);
  const lastIndex = days.length - 1;

  const points = days.map((date, i) => {
    const ideal = lastIndex <= 0 ? 0 : totalStoryPoints * (1 - i / lastIndex);
    if (date > today) return { date, ideal, actual: null };
    const deliveredByDate = sum(
      activities.filter((a) => isCompleted(a) && a.deliveredDate !== null && a.deliveredDate <= date).map((a) => a.storyPoints ?? 0),
    );
    return { date, ideal, actual: totalStoryPoints - deliveredByDate };
  });

  return { totalStoryPoints, points };
}

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

function count(activities: Activity[], predicate: (a: Activity) => boolean): number {
  return activities.filter(predicate).length;
}
