import { callJiraTool, type JiraCredentials } from '../mcp/client.js';
import { searchAllIssues } from './searchAllIssues.js';
import { mapWithConcurrency } from './mapWithConcurrency.js';
import { groupSubtasks, type RawSubtask, type RawWorklogEntry } from './groupSubtasks.js';
import { fillTruncatedWorklogs } from './fillTruncatedWorklogs.js';
import { parseSprintField } from './parseSprintField.js';
import { getSprintEntryDate } from './fetchSprintEntry.js';
import { mapActivity, type RawStory } from '../domain/mapActivity.js';
import type { Activity, BoardDataResponse, SprintInfo } from '../domain/types.js';
import { DEFAULT_HOURS_PER_PF, DEFAULT_HOURS_PER_DAY, IMPL_SHARE } from '../compute/timeline.js';

const GET_ISSUE_CONCURRENCY = 6;
const CHANGELOG_CONCURRENCY = 6;

interface StorySearchHit {
  key: string;
  customfield_10001?: string[];
}

interface StoryDetail {
  key: string;
  summary: string;
  status: string;
  statusCategory: string;
  storyPoints: number | null;
  desenvolvedor: string | null;
  assignee: string | null;
  testador: string | null;
  created: string;
  updated: string;
}

function todayISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function quoteJql(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

export async function fetchBoardData(
  vertical: string,
  credentials: JiraCredentials,
  hoursPerPf: number | undefined,
  hoursPerDay: number | undefined,
): Promise<BoardDataResponse> {
  const baseUrl = requireEnv('JIRA_BASE_URL').replace(/\/$/, '');
  const today = todayISO();

  const [storyHits, subtasks] = await Promise.all([
    searchAllIssues<StorySearchHit>(
      `vertical = ${quoteJql(vertical)} AND issuetype = Story AND sprint in openSprints()`,
      ['customfield_10001'],
      credentials,
    ),
    searchAllIssues<RawSubtask>(
      `vertical = ${quoteJql(vertical)} AND issuetype in (Bug, Implementação, Teste) AND sprint in openSprints()`,
      ['parent', 'worklog'],
      credentials,
    ),
  ]);

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
  } = groupSubtasks(subtasksWithFullWorklogs);

  const storyDetails = await mapWithConcurrency(storyHits, GET_ISSUE_CONCURRENCY, async (hit) => {
    try {
      return await callJiraTool<StoryDetail>('get_issue', { issueKey: hit.key, response_format: 'detailed' }, credentials);
    } catch (err) {
      console.error(`[fetchBoardData] Falha ao buscar ${hit.key}, ignorando:`, err instanceof Error ? err.message : err);
      return null;
    }
  });

  const sprintByStoryKey = new Map(storyHits.map((hit) => [hit.key, parseSprintField(hit.customfield_10001)]));

  // Data em que cada story entrou na sprint atual (via changelog do Jira, com cache por `updated`
  // dentro de getSprintEntryDate) — usada para marcar atividades adicionadas depois do início da
  // sprint. Buscada para todas as stories resolvidas; `mapActivity` já suprime a marcação para
  // herdadas, então não precisa duplicar aqui a lógica de "é herdada".
  const resolvedStories = (storyDetails.filter((s): s is StoryDetail => s !== null)).filter((s) => sprintByStoryKey.get(s.key));
  const sprintEntryPairs = await mapWithConcurrency(resolvedStories, CHANGELOG_CONCURRENCY, async (story) => {
    const sprint = sprintByStoryKey.get(story.key)!;
    const sprintEnteredAt = await getSprintEntryDate(story.key, story.updated, sprint.name, credentials);
    return [story.key, sprintEnteredAt] as const;
  });
  const sprintEntryByStoryKey = new Map(sprintEntryPairs);

  const sprints = new Map<string, SprintInfo>();
  const activities: Activity[] = [];

  for (const story of storyDetails as (RawStory & { key: string } | null)[]) {
    if (!story) continue; // busca dessa issue falhou (ver log do servidor); segue sem ela

    const sprint = sprintByStoryKey.get(story.key);
    if (!sprint) continue; // issue sem sprint ativa resolvida (não deveria ocorrer dada a JQL)

    if (!sprints.has(sprint.id)) {
      sprints.set(sprint.id, {
        id: sprint.id,
        name: sprint.name,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        startDateTime: sprint.startDateTime,
        endDateTime: sprint.endDateTime,
      });
    }

    activities.push(
      mapActivity({
        story: {
          ...story,
          desenvolvedor: story.desenvolvedor ?? null,
          assignee: story.assignee ?? null,
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
        sprintEnteredAt: sprintEntryByStoryKey.get(story.key) ?? null,
        baseUrl,
        today,
        hoursPerPf,
        hoursPerDay,
      }),
    );
  }

  activities.sort((a, b) => a.developer.localeCompare(b.developer) || a.title.localeCompare(b.title));

  return {
    generatedAt: new Date().toISOString(),
    today,
    vertical,
    hoursPerPf: hoursPerPf ?? DEFAULT_HOURS_PER_PF,
    hoursPerDay: hoursPerDay ?? DEFAULT_HOURS_PER_DAY,
    assumedTestSharePercent: (1 - IMPL_SHARE) * 100,
    sprints: [...sprints.values()].sort((a, b) => a.name.localeCompare(b.name)),
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
