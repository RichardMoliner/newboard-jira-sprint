import type { JiraCredentials } from '../mcp/client.js';

export interface ChangelogHistoryItem {
  field?: string;
  toString?: string | null;
}

export interface ChangelogHistory {
  created: string;
  items: ChangelogHistoryItem[];
}

/**
 * Acha o timestamp em que a issue entrou pela última vez na sprint informada, a partir do
 * changelog do Jira. Ignora mudanças de campo "Sprint" que não mencionam essa sprint (ex.: saiu
 * dela para outra) e mudanças de outros campos. `toString` pode listar mais de uma sprint
 * separada por vírgula quando o campo é multi-valor — checa por substring, não igualdade exata.
 */
export function findSprintEntryDate(histories: ChangelogHistory[], sprintName: string): string | null {
  const matches = histories
    .flatMap((h) => h.items.map((item) => ({ created: h.created, item })))
    .filter(({ item }) => item.field === 'Sprint' && (item.toString ?? '').includes(sprintName));

  if (matches.length === 0) return null;

  matches.sort((a, b) => a.created.localeCompare(b.created));
  return matches[matches.length - 1].created;
}

/**
 * Acha o timestamp da transição mais recente para o status atual da issue, a partir do changelog —
 * usado como a data real de entrega de uma story concluída (`story.updated` não serve: a issue
 * pode ser tocada bem depois da entrega de fato, por algo sem relação, e isso infla a data).
 * Pega a transição mais recente (não a primeira) pra lidar com reabertura/refechamento.
 */
export function findDoneTransitionDate(histories: ChangelogHistory[], currentStatus: string): string | null {
  const matches = histories
    .flatMap((h) => h.items.map((item) => ({ created: h.created, item })))
    .filter(({ item }) => item.field === 'status' && item.toString === currentStatus);

  if (matches.length === 0) return null;

  matches.sort((a, b) => a.created.localeCompare(b.created));
  return matches[matches.length - 1].created;
}

interface CacheEntry {
  updated: string;
  sprintEnteredAt: string | null;
  doneTransitionDate: string | null;
}

// Cache em memória (nível de módulo, sobrevive entre requisições mas não a restarts) — evita
// rebuscar o changelog quando a issue não mudou desde a última vez (mesmo `updated`).
const cache = new Map<string, CacheEntry>();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente ${name} não definida. Configure o arquivo .env (veja .env.example).`);
  }
  return value;
}

async function fetchIssueChangelog(issueKey: string, credentials: JiraCredentials): Promise<ChangelogHistory[]> {
  const baseUrl = requireEnv('JIRA_BASE_URL').replace(/\/$/, '');
  const auth = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
  const res = await fetch(`${baseUrl}/rest/api/2/issue/${issueKey}?fields=*none&expand=changelog`, {
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Jira retornou ${res.status} ao buscar changelog de ${issueKey}`);
  }
  const data = (await res.json()) as { changelog?: { histories?: ChangelogHistory[] } };
  return data.changelog?.histories ?? [];
}

export interface IssueHistoryFacts {
  sprintEnteredAt: string | null;
  doneTransitionDate: string | null;
}

/**
 * Busca o changelog da issue uma única vez e extrai dele os dois fatos que o board precisa:
 * quando ela entrou na sprint atual e quando transicionou pro status atual (usado como data real
 * de entrega quando a story está concluída). Busca só quando necessário: se o `updated` da issue
 * não mudou desde a última chamada, reaproveita o cache (nenhuma chamada extra ao Jira). Falha ao
 * buscar o changelog não derruba o board inteiro — cai pra `null` nos dois fatos e loga o erro.
 */
export async function getIssueHistoryFacts(
  issueKey: string,
  updated: string,
  sprintName: string,
  currentStatus: string,
  credentials: JiraCredentials,
): Promise<IssueHistoryFacts> {
  const cached = cache.get(issueKey);
  if (cached && cached.updated === updated) {
    return { sprintEnteredAt: cached.sprintEnteredAt, doneTransitionDate: cached.doneTransitionDate };
  }

  let sprintEnteredAt: string | null;
  let doneTransitionDate: string | null;
  try {
    const histories = await fetchIssueChangelog(issueKey, credentials);
    sprintEnteredAt = findSprintEntryDate(histories, sprintName);
    doneTransitionDate = findDoneTransitionDate(histories, currentStatus);
  } catch (err) {
    console.error(`[fetchSprintEntry] Falha ao buscar changelog de ${issueKey}, ignorando:`, err instanceof Error ? err.message : err);
    sprintEnteredAt = null;
    doneTransitionDate = null;
  }

  cache.set(issueKey, { updated, sprintEnteredAt, doneTransitionDate });
  return { sprintEnteredAt, doneTransitionDate };
}
