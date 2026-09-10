import { callJiraTool, type JiraCredentials } from '../mcp/client.js';
import { searchAllIssues } from './searchAllIssues.js';
import { mapWithConcurrency } from './mapWithConcurrency.js';
import { groupSubtasks, type RawSubtask } from './groupSubtasks.js';
import { parseSprintField } from './parseSprintField.js';
import { mapActivity, type RawStory } from '../domain/mapActivity.js';
import type { Activity, BoardDataResponse, SprintInfo } from '../domain/types.js';
import { DEFAULT_HOURS_PER_PF, DEFAULT_HOURS_PER_DAY } from '../compute/timeline.js';

const GET_ISSUE_CONCURRENCY = 6;

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
      `vertical = ${quoteJql(vertical)} AND issuetype in (Bug, Implementação) AND sprint in openSprints()`,
      ['parent'],
      credentials,
    ),
  ]);

  const { implStartByParent, implDoneByParent, bugsByParent } = groupSubtasks(subtasks);

  const storyDetails = await mapWithConcurrency(storyHits, GET_ISSUE_CONCURRENCY, async (hit) => {
    try {
      return await callJiraTool<StoryDetail>('get_issue', { issueKey: hit.key, response_format: 'detailed' }, credentials);
    } catch (err) {
      console.error(`[fetchBoardData] Falha ao buscar ${hit.key}, ignorando:`, err instanceof Error ? err.message : err);
      return null;
    }
  });

  const sprintByStoryKey = new Map(storyHits.map((hit) => [hit.key, parseSprintField(hit.customfield_10001)]));

  const sprints = new Map<string, SprintInfo>();
  const activities: Activity[] = [];

  for (const story of storyDetails as (RawStory & { key: string } | null)[]) {
    if (!story) continue; // busca dessa issue falhou (ver log do servidor); segue sem ela

    const sprint = sprintByStoryKey.get(story.key);
    if (!sprint) continue; // issue sem sprint ativa resolvida (não deveria ocorrer dada a JQL)

    if (!sprints.has(sprint.id)) {
      sprints.set(sprint.id, { id: sprint.id, name: sprint.name, startDate: sprint.startDate, endDate: sprint.endDate });
    }

    activities.push(
      mapActivity({
        story: {
          ...story,
          desenvolvedor: story.desenvolvedor ?? null,
          assignee: story.assignee ?? null,
          testador: story.testador ?? null,
          storyPoints: story.storyPoints ?? null,
        },
        sprint,
        implStartDate: implStartByParent.get(story.key) ?? null,
        implDone: implDoneByParent.get(story.key) ?? false,
        bugs: bugsByParent.get(story.key) ?? [],
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
