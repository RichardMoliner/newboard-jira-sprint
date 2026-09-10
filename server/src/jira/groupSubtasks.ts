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
  /** True quando a(s) subtarefa(s) "Implementação" da atividade pai estão todas "Atendida". */
  implDoneByParent: Map<string, boolean>;
  bugsByParent: Map<string, BugSubtask[]>;
}

function dateOnly(isoDateTime: string): string {
  return isoDateTime.slice(0, 10);
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function isResolvedStatus(status: string): boolean {
  return normalize(status) === 'atendida';
}

/** Agrupa subtarefas (Implementação/Bug) buscadas em lote pela atividade (Story) pai. */
export function groupSubtasks(subtasks: RawSubtask[]): GroupedSubtasks {
  const implStartByParent = new Map<string, string>();
  const implStatusesByParent = new Map<string, string[]>();
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
      const statuses = implStatusesByParent.get(parentKey) ?? [];
      statuses.push(subtask.status);
      implStatusesByParent.set(parentKey, statuses);
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

  const implDoneByParent = new Map<string, boolean>();
  for (const [parentKey, statuses] of implStatusesByParent) {
    implDoneByParent.set(parentKey, statuses.every(isResolvedStatus));
  }

  return { implStartByParent, implDoneByParent, bugsByParent };
}
