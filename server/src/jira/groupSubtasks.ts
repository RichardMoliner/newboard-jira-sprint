import type { BugSubtask, WorklogEntry } from '../domain/types.js';

interface RawWorklogEntry {
  author: { displayName: string };
  started: string;
  timeSpentSeconds: number;
  comment?: string;
}

export interface RawSubtask {
  key: string;
  summary: string;
  status: string;
  type: string;
  assignee: string | null;
  created: string;
  updated: string;
  parent?: { key: string };
  /** Só presente quando `worklog` é pedido como extraField na busca (subtarefas de Implementação/Teste/Bug). */
  worklog?: { worklogs: RawWorklogEntry[] };
}

export interface GroupedSubtasks {
  /** Data (YYYY-MM-DD) de criação da subtarefa "Implementação" mais antiga de cada atividade pai. */
  implStartByParent: Map<string, string>;
  /** True quando a(s) subtarefa(s) "Implementação" da atividade pai estão todas "Atendida". */
  implDoneByParent: Map<string, boolean>;
  /** True quando a(s) subtarefa(s) "Teste" da atividade pai estão todas "Atendida". */
  testDoneByParent: Map<string, boolean>;
  /** Data (YYYY-MM-DD) mais recente de atualização das subtarefas "Teste" já atendidas — usada como data de entrega quando a story ainda não foi formalmente concluída. */
  testDoneDateByParent: Map<string, string>;
  /** Soma das horas apontadas (worklog) nas subtarefas de Implementação/Teste de cada atividade pai. */
  implLoggedHoursByParent: Map<string, number>;
  testLoggedHoursByParent: Map<string, number>;
  /** Todos os apontamentos (Implementação + Teste), por atividade pai, ordenados por data. */
  worklogEntriesByParent: Map<string, WorklogEntry[]>;
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

/** Agrupa subtarefas (Implementação/Teste/Bug) buscadas em lote pela atividade (Story) pai. */
export function groupSubtasks(subtasks: RawSubtask[]): GroupedSubtasks {
  const implStartByParent = new Map<string, string>();
  const implStatusesByParent = new Map<string, string[]>();
  const testStatusesByParent = new Map<string, string[]>();
  const testUpdatedByParent = new Map<string, string>();
  const implLoggedSecondsByParent = new Map<string, number>();
  const testLoggedSecondsByParent = new Map<string, number>();
  const worklogEntriesByParent = new Map<string, WorklogEntry[]>();
  const bugsByParent = new Map<string, BugSubtask[]>();

  function addWorklogs(subtask: RawSubtask, parentKey: string, subtaskType: 'Implementação' | 'Teste', secondsByParent: Map<string, number>) {
    const entries = subtask.worklog?.worklogs ?? [];
    let totalSeconds = secondsByParent.get(parentKey) ?? 0;
    const list = worklogEntriesByParent.get(parentKey) ?? [];
    for (const worklog of entries) {
      totalSeconds += worklog.timeSpentSeconds;
      list.push({
        subtaskType,
        author: worklog.author.displayName,
        date: dateOnly(worklog.started),
        hours: worklog.timeSpentSeconds / 3600,
        comment: worklog.comment ?? null,
      });
    }
    secondsByParent.set(parentKey, totalSeconds);
    worklogEntriesByParent.set(parentKey, list);
  }

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
      addWorklogs(subtask, parentKey, 'Implementação', implLoggedSecondsByParent);
    }

    if (subtask.type === 'Teste') {
      const statuses = testStatusesByParent.get(parentKey) ?? [];
      statuses.push(subtask.status);
      testStatusesByParent.set(parentKey, statuses);
      const updatedDate = dateOnly(subtask.updated);
      const current = testUpdatedByParent.get(parentKey);
      if (!current || updatedDate > current) {
        testUpdatedByParent.set(parentKey, updatedDate);
      }
      addWorklogs(subtask, parentKey, 'Teste', testLoggedSecondsByParent);
    }

    if (subtask.type === 'Bug') {
      const bugWorklogEntries: WorklogEntry[] = (subtask.worklog?.worklogs ?? []).map((worklog) => ({
        subtaskType: 'Bug' as const,
        author: worklog.author.displayName,
        date: dateOnly(worklog.started),
        hours: worklog.timeSpentSeconds / 3600,
        comment: worklog.comment ?? null,
      }));

      const bug: BugSubtask = {
        key: subtask.key,
        title: subtask.summary,
        developer: subtask.assignee,
        status: subtask.status,
        startDate: dateOnly(subtask.created),
        endDate: dateOnly(subtask.updated),
        worklogEntries: bugWorklogEntries,
      };
      const list = bugsByParent.get(parentKey) ?? [];
      list.push(bug);
      bugsByParent.set(parentKey, list);

      // Também entram na lista geral de apontamentos (tooltip da atividade) — a classificação em
      // horas de Implementação/Teste acontece depois, em mapActivity, por quem apontou.
      const allEntries = worklogEntriesByParent.get(parentKey) ?? [];
      allEntries.push(...bugWorklogEntries);
      worklogEntriesByParent.set(parentKey, allEntries);
    }
  }

  const implDoneByParent = new Map<string, boolean>();
  for (const [parentKey, statuses] of implStatusesByParent) {
    implDoneByParent.set(parentKey, statuses.every(isResolvedStatus));
  }

  const testDoneByParent = new Map<string, boolean>();
  for (const [parentKey, statuses] of testStatusesByParent) {
    testDoneByParent.set(parentKey, statuses.every(isResolvedStatus));
  }

  const implLoggedHoursByParent = new Map<string, number>();
  for (const [parentKey, seconds] of implLoggedSecondsByParent) {
    implLoggedHoursByParent.set(parentKey, seconds / 3600);
  }

  const testLoggedHoursByParent = new Map<string, number>();
  for (const [parentKey, seconds] of testLoggedSecondsByParent) {
    testLoggedHoursByParent.set(parentKey, seconds / 3600);
  }

  for (const list of worklogEntriesByParent.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date));
  }

  return {
    implStartByParent,
    implDoneByParent,
    testDoneByParent,
    testDoneDateByParent: testUpdatedByParent,
    implLoggedHoursByParent,
    testLoggedHoursByParent,
    worklogEntriesByParent,
    bugsByParent,
  };
}
