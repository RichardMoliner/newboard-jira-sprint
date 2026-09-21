import { mapWithConcurrency } from './mapWithConcurrency.js';
import type { RawSubtask, RawWorklogEntry } from './groupSubtasks.js';

const CONCURRENCY = 6;

/**
 * A busca em lote (`search_issues`) traz o campo `worklog` embutido em cada issue já truncado (a API
 * do Jira limita essa lista, tipicamente a 20 registros), independente da paginação da própria busca
 * — subtarefas com mais apontamentos do que isso perdem os mais recentes silenciosamente. Para as que
 * têm `total` maior que a lista recebida, busca a lista completa via uma chamada dedicada por issue.
 */
export async function fillTruncatedWorklogs(
  subtasks: RawSubtask[],
  fetchFullWorklogs: (issueKey: string, total: number) => Promise<RawWorklogEntry[]>,
): Promise<RawSubtask[]> {
  return mapWithConcurrency(subtasks, CONCURRENCY, async (subtask) => {
    const worklog = subtask.worklog;
    if (!worklog || worklog.total === undefined || worklog.total <= worklog.worklogs.length) {
      return subtask;
    }
    const worklogs = await fetchFullWorklogs(subtask.key, worklog.total);
    return { ...subtask, worklog: { ...worklog, worklogs } };
  });
}
