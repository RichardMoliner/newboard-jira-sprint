import type { JiraCredentials } from '../mcp/client.js';
import { searchAllIssues } from './searchAllIssues.js';
import { parseAllSprintFields } from './parseSprintField.js';
import { quoteJql } from './fetchBoardData.js';
import type { SprintInfo } from '../domain/types.js';

export interface ClosedSprintSearchHit {
  customfield_10001?: string[];
}

/**
 * Extrai e deduplica as sprints FECHADAS referenciadas nas issues, com início (startDate) no dia
 * `since` ou depois — uma issue pode ter passado por várias sprints ao longo do tempo (inclusive
 * uma aberta atualmente), então olha TODAS as entradas do campo, não só a mais relevante pro estado
 * atual da issue. Ordenado da mais recente pra mais antiga.
 */
export function extractClosedSprints(issues: ClosedSprintSearchHit[], since: string): SprintInfo[] {
  const map = new Map<string, SprintInfo>();
  for (const issue of issues) {
    for (const sprint of parseAllSprintFields(issue.customfield_10001)) {
      if (sprint.state !== 'CLOSED') continue;
      if (sprint.startDate < since) continue;
      if (map.has(sprint.id)) continue;
      map.set(sprint.id, {
        id: sprint.id,
        name: sprint.name,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        startDateTime: sprint.startDateTime,
        endDateTime: sprint.endDateTime,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.startDate.localeCompare(a.startDate));
}

/** Busca leve (só o campo de sprint, sem subtarefas/apontamentos) pra listar as sprints fechadas
 * disponíveis pra uma vertical, a partir de uma data de início — usada pra popular o seletor da
 * aba Histórico antes de carregar os dados pesados de alguma sprint escolhida. */
export async function discoverClosedSprints(vertical: string, since: string, credentials: JiraCredentials): Promise<SprintInfo[]> {
  const issues = await searchAllIssues<ClosedSprintSearchHit>(
    `vertical = ${quoteJql(vertical)} AND issuetype = Story AND sprint in closedSprints() AND updated >= ${quoteJql(since)}`,
    ['customfield_10001'],
    credentials,
  );
  return extractClosedSprints(issues, since);
}
