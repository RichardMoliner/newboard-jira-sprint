import type { BugSubtask } from '../domain/types.js';

export interface RawSubtask {
  key: string;
  summary: string;
  status: string;
  type: string;
  assignee: string | null;
  created: string;
  updated: string;
  parent?: { key: string };
}

export interface GroupedSubtasks {
  /** Data (YYYY-MM-DD) de criação da subtarefa "Implementação" mais antiga de cada atividade pai. */
  implStartByParent: Map<string, string>;
  bugsByParent: Map<string, BugSubtask[]>;
}

function dateOnly(isoDateTime: string): string {
  return isoDateTime.slice(0, 10);
}

/** Agrupa subtarefas (Implementação/Bug) buscadas em lote pela atividade (Story) pai. */
export function groupSubtasks(subtasks: RawSubtask[]): GroupedSubtasks {
  const implStartByParent = new Map<string, string>();
  const bugsByParent = new Map<string, BugSubtask[]>();

  for (const subtask of subtasks) {
    const parentKey = subtask.parent?.key;
    if (!parentKey) continue;

    if (subtask.type === 'Implementação') {
      const startDate = dateOnly(subtask.created);
      const current = implStartByParent.get(parentKey);
      if (!current || startDate < current) {
        implStartByParent.set(parentKey, startDate);
      }
    }

    if (subtask.type === 'Bug') {
      const bug: BugSubtask = {
        key: subtask.key,
        title: subtask.summary,
        developer: subtask.assignee,
        status: subtask.status,
        startDate: dateOnly(subtask.created),
        endDate: dateOnly(subtask.updated),
      };
      const list = bugsByParent.get(parentKey) ?? [];
      list.push(bug);
      bugsByParent.set(parentKey, list);
    }
  }

  return { implStartByParent, bugsByParent };
}
