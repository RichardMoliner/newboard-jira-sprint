import { callJiraTool, type JiraCredentials } from '../mcp/client.js';

interface SearchIssuesResponse<T> {
  issues: T[];
  total: number;
  startAt: number;
  maxResults: number;
  hasMore: boolean;
}

const PAGE_SIZE = 100;

/** Busca todas as issues de uma JQL, paginando automaticamente até esgotar os resultados. */
export async function searchAllIssues<T>(
  jql: string,
  extraFields: string[] = [],
  credentials: JiraCredentials,
): Promise<T[]> {
  const all: T[] = [];
  let startAt = 0;

  while (true) {
    const page = await callJiraTool<SearchIssuesResponse<T>>(
      'search_issues',
      {
        jql,
        maxResults: PAGE_SIZE,
        startAt,
        extraFields,
        response_format: 'detailed',
      },
      credentials,
    );
    all.push(...page.issues);
    if (!page.hasMore) break;
    startAt += page.issues.length;
  }

  return all;
}
