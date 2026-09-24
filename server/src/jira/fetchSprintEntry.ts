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

interface CacheEntry {
  updated: string;
  sprintEnteredAt: string | null;
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

/**
 * Data em que a issue entrou na sprint atual, buscando o changelog só quando necessário: se o
 * `updated` da issue não mudou desde a última chamada, reaproveita o valor em cache (nenhuma
 * chamada extra ao Jira). Falha ao buscar o changelog não derruba o board inteiro — cai para
 * `null` (não marca como "adicionada depois") e loga o erro.
 */
export async function getSprintEntryDate(
  issueKey: string,
  updated: string,
  sprintName: string,
  credentials: JiraCredentials,
): Promise<string | null> {
  const cached = cache.get(issueKey);
  if (cached && cached.updated === updated) {
    return cached.sprintEnteredAt;
  }

  let sprintEnteredAt: string | null;
  try {
    const histories = await fetchIssueChangelog(issueKey, credentials);
    sprintEnteredAt = findSprintEntryDate(histories, sprintName);
  } catch (err) {
    console.error(`[fetchSprintEntry] Falha ao buscar changelog de ${issueKey}, ignorando:`, err instanceof Error ? err.message : err);
    sprintEnteredAt = null;
  }

  cache.set(issueKey, { updated, sprintEnteredAt });
  return sprintEnteredAt;
}
