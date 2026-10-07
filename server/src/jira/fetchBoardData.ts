import { callJiraTool, type JiraCredentials } from '../mcp/client.js';
import { searchAllIssues } from './searchAllIssues.js';
import { mapWithConcurrency } from './mapWithConcurrency.js';
import { groupSubtasks, type RawSubtask, type RawWorklogEntry } from './groupSubtasks.js';
import { inferDeveloperRoles } from './inferRoles.js';
import { fillTruncatedWorklogs } from './fillTruncatedWorklogs.js';
import { parseSprintField } from './parseSprintField.js';
import { getIssueHistoryFacts } from './fetchSprintEntry.js';
import { report } from './progressLog.js';
import { mapActivity, type RawStory } from '../domain/mapActivity.js';
import type { Activity, BoardDataResponse, SprintInfo } from '../domain/types.js';
import { DEFAULT_HOURS_PER_PF, DEFAULT_HOURS_PER_DAY, IMPL_SHARE } from '../compute/timeline.js';

const GET_ISSUE_CONCURRENCY = 6;
const CHANGELOG_CONCURRENCY = 6;

interface StorySearchHit {
  key: string;
  customfield_10001?: string[];
  /** Campo "Exigência": nome da exigência legal/regulatória atendida, quando a story é uma. */
  customfield_10212?: { value: string } | null;
  /** Campo "Data final": data-limite (YYYY-MM-DD) de entrega da exigência. */
  customfield_21800?: string | null;
}

interface StoryDetail {
  key: string;
  summary: string;
  status: string;
  statusCategory: string;
  storyPoints: number | null;
  testador: string | null;
  created: string;
  updated: string;
  /** Rótulos (labels) da story — já vem no response_format "detailed" do get_issue, sem custo extra. */
  labels?: string[];
}

function todayISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function quoteJql(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

interface SprintScopeResult {
  sprints: SprintInfo[];
  activities: Activity[];
  today: string;
}

/**
 * Núcleo do fetch, parametrizado pelo recorte de sprint em JQL (`sprint in openSprints()` pro board
 * ao vivo, `sprint = X`/`sprint in (X, Y)` pra sprints fechadas no Histórico) e por como calcular
 * "hoje" — data real pro board ao vivo, mas a data de fim da sprint mais recente entre as buscadas
 * quando é histórico (senão tarefas de uma sprint fechada há meses apareceriam com cálculos de
 * atraso/prazo comparados com a data real de hoje, sem sentido pra uma foto congelada do passado).
 */
async function fetchActivitiesForSprintScope(
  vertical: string,
  sprintScopeJql: string,
  todayStrategy: 'now' | 'latest-sprint-end',
  credentials: JiraCredentials,
  hoursPerPfBySprintId: Record<string, number | null>,
  hoursPerDay: number | undefined,
): Promise<SprintScopeResult> {
  const baseUrl = requireEnv('JIRA_BASE_URL').replace(/\/$/, '');

  report('Buscando atividades da sprint...');
  const [storyHits, subtasks] = await Promise.all([
    searchAllIssues<StorySearchHit>(
      `vertical = ${quoteJql(vertical)} AND issuetype = Story AND ${sprintScopeJql}`,
      ['customfield_10001', 'customfield_10212', 'customfield_21800'],
      credentials,
    ),
    searchAllIssues<RawSubtask>(
      `vertical = ${quoteJql(vertical)} AND issuetype in (Bug, Implementação, Teste) AND ${sprintScopeJql}`,
      ['parent', 'worklog', 'customfield_10232', 'labels'],
      credentials,
    ),
  ]);

  report('Buscando apontamentos de horas...');
  const subtasksWithFullWorklogs = await fillTruncatedWorklogs(subtasks, async (issueKey, total) => {
    const response = await callJiraTool<{ worklogs: RawWorklogEntry[] }>(
      'get_worklogs',
      { issueKey, maxResults: total },
      credentials,
    );
    return response.worklogs;
  });

  const {
    implStartByParent,
    implDoneByParent,
    implDoneDateByParent,
    testDoneByParent,
    testDoneDateByParent,
    implLoggedHoursByParent,
    testLoggedHoursByParent,
    worklogEntriesByParent,
    bugsByParent,
    testerByParent,
    developerByParent,
  } = groupSubtasks(subtasksWithFullWorklogs, baseUrl);
  const developerRoles = inferDeveloperRoles(subtasksWithFullWorklogs);

  report('Buscando detalhes das stories...');
  const storyDetails = await mapWithConcurrency(storyHits, GET_ISSUE_CONCURRENCY, async (hit) => {
    try {
      return await callJiraTool<StoryDetail>('get_issue', { issueKey: hit.key, response_format: 'detailed' }, credentials);
    } catch (err) {
      console.error(`[fetchBoardData] Falha ao buscar ${hit.key}, ignorando:`, err instanceof Error ? err.message : err);
      return null;
    }
  });

  const sprintByStoryKey = new Map(storyHits.map((hit) => [hit.key, parseSprintField(hit.customfield_10001)]));
  const legalInfoByStoryKey = new Map(
    storyHits.map((hit) => [
      hit.key,
      { legalRequirement: hit.customfield_10212?.value ?? null, legalDeadline: hit.customfield_21800 ?? null },
    ]),
  );

  const sprints = new Map<string, SprintInfo>();
  for (const parsed of sprintByStoryKey.values()) {
    if (parsed && !sprints.has(parsed.id)) {
      sprints.set(parsed.id, {
        id: parsed.id,
        name: parsed.name,
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        startDateTime: parsed.startDateTime,
        endDateTime: parsed.endDateTime,
      });
    }
  }

  const today =
    todayStrategy === 'now'
      ? todayISO()
      : ([...sprints.values()].map((s) => s.endDate).sort().slice(-1)[0] ?? todayISO());

  // Data em que cada story entrou na sprint atual (via changelog do Jira, com cache por `updated`
  // dentro de getSprintEntryDate) — usada para marcar atividades adicionadas depois do início da
  // sprint. Buscada para todas as stories resolvidas; `mapActivity` já suprime a marcação para
  // herdadas, então não precisa duplicar aqui a lógica de "é herdada".
  const resolvedStories = (storyDetails.filter((s): s is StoryDetail => s !== null)).filter((s) => sprintByStoryKey.get(s.key));
  report('Buscando histórico de sprint...');
  const historyFactPairs = await mapWithConcurrency(resolvedStories, CHANGELOG_CONCURRENCY, async (story) => {
    const sprint = sprintByStoryKey.get(story.key)!;
    const facts = await getIssueHistoryFacts(story.key, story.updated, sprint.name, story.status, credentials);
    return [story.key, facts] as const;
  });
  const historyFactsByStoryKey = new Map(historyFactPairs);

  const activities: Activity[] = [];

  for (const story of storyDetails as (RawStory & { key: string } | null)[]) {
    if (!story) continue; // busca dessa issue falhou (ver log do servidor); segue sem ela

    const sprint = sprintByStoryKey.get(story.key);
    if (!sprint) continue; // issue sem sprint resolvida (não deveria ocorrer dada a JQL)

    activities.push(
      mapActivity({
        story: {
          ...story,
          // Sem o campo "testador" preenchido na story, usa o responsável pela subtarefa de Teste.
          testador: story.testador ?? testerByParent.get(story.key) ?? null,
          storyPoints: story.storyPoints ?? null,
        },
        sprint,
        implStartDate: implStartByParent.get(story.key) ?? null,
        implDone: implDoneByParent.get(story.key) ?? false,
        implDoneDate: implDoneDateByParent.get(story.key) ?? null,
        testDone: testDoneByParent.get(story.key) ?? false,
        testDoneDate: testDoneDateByParent.get(story.key) ?? null,
        implLoggedHours: implLoggedHoursByParent.get(story.key) ?? null,
        testLoggedHours: testLoggedHoursByParent.get(story.key) ?? null,
        worklogEntries: worklogEntriesByParent.get(story.key) ?? [],
        bugs: bugsByParent.get(story.key) ?? [],
        implementationAssignee: developerByParent.get(story.key) ?? null,
        developerRoles,
        sprintEnteredAt: historyFactsByStoryKey.get(story.key)?.sprintEnteredAt ?? null,
        doneTransitionDate: historyFactsByStoryKey.get(story.key)?.doneTransitionDate ?? null,
        legalRequirement: legalInfoByStoryKey.get(story.key)?.legalRequirement ?? null,
        legalDeadline: legalInfoByStoryKey.get(story.key)?.legalDeadline ?? null,
        baseUrl,
        today,
        hoursPerPf: hoursPerPfBySprintId[sprint.id] ?? undefined,
        hoursPerDay,
      }),
    );
  }

  activities.sort((a, b) => a.developer.localeCompare(b.developer) || a.title.localeCompare(b.title));

  report('Concluído.');

  return { sprints: [...sprints.values()].sort((a, b) => a.name.localeCompare(b.name)), activities, today };
}

export async function fetchBoardData(
  vertical: string,
  credentials: JiraCredentials,
  hoursPerPfBySprintId: Record<string, number | null>,
  hoursPerDay: number | undefined,
): Promise<BoardDataResponse> {
  const { sprints, activities, today } = await fetchActivitiesForSprintScope(
    vertical,
    'sprint in openSprints()',
    'now',
    credentials,
    hoursPerPfBySprintId,
    hoursPerDay,
  );

  return {
    generatedAt: new Date().toISOString(),
    today,
    vertical,
    hoursPerDay: hoursPerDay ?? DEFAULT_HOURS_PER_DAY,
    defaultHoursPerPf: DEFAULT_HOURS_PER_PF,
    assumedTestSharePercent: (1 - IMPL_SHARE) * 100,
    sprints,
    activities,
  };
}

/** Mesmo pipeline do board ao vivo, mas para uma ou mais sprints já fechadas (aba Histórico) — veja
 * o comentário de `fetchActivitiesForSprintScope` sobre a âncora de "hoje" usada nesse caso. Usa as
 * mesmas configurações por sprint (horas/PF) salvas pra cada uma — uma sprint fechada continua
 * usando o valor que estava configurado nela, mesmo depois de encerrada. */
export async function fetchClosedSprintsData(
  vertical: string,
  sprintIds: string[],
  credentials: JiraCredentials,
  hoursPerPfBySprintId: Record<string, number | null>,
  hoursPerDay: number | undefined,
): Promise<BoardDataResponse> {
  const sprintScopeJql = `sprint in (${sprintIds.join(',')})`;
  const { sprints, activities, today } = await fetchActivitiesForSprintScope(
    vertical,
    sprintScopeJql,
    'latest-sprint-end',
    credentials,
    hoursPerPfBySprintId,
    hoursPerDay,
  );

  return {
    generatedAt: new Date().toISOString(),
    today,
    vertical,
    hoursPerDay: hoursPerDay ?? DEFAULT_HOURS_PER_DAY,
    defaultHoursPerPf: DEFAULT_HOURS_PER_PF,
    assumedTestSharePercent: (1 - IMPL_SHARE) * 100,
    sprints,
    activities,
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente ${name} não definida. Configure o arquivo .env (veja .env.example).`);
  }
  return value;
}
