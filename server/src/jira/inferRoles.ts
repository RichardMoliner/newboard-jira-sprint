import type { RawSubtask } from './groupSubtasks.js';

export type DeveloperRole = 'dev' | 'tester';

/** Apontamentos de 5 minutos ou menos são ruído — mesmo critério de `groupSubtasks`. */
const NEGLIGIBLE_WORKLOG_SECONDS = 5 * 60;

/**
 * Deduz o papel (dev ou tester) de cada pessoa a partir de quem foi responsável (assignee) por
 * subtarefas de Implementação/Teste na sprint. Quem foi responsável pelos dois tipos — acontece
 * quando um dev corrige o bug/story de outro, ou um tester ajuda em outra story — desempata pelo
 * total de horas realmente apontadas em cada tipo; empate exato vira 'dev'.
 */
export function inferDeveloperRoles(subtasks: RawSubtask[]): Map<string, DeveloperRole> {
  const implAssignees = new Set<string>();
  const testAssignees = new Set<string>();
  const implSecondsByPerson = new Map<string, number>();
  const testSecondsByPerson = new Map<string, number>();

  for (const subtask of subtasks) {
    if (subtask.type !== 'Implementação' && subtask.type !== 'Teste') continue;

    const assignees = subtask.type === 'Implementação' ? implAssignees : testAssignees;
    if (subtask.assignee) assignees.add(subtask.assignee);

    const secondsByPerson = subtask.type === 'Implementação' ? implSecondsByPerson : testSecondsByPerson;
    for (const worklog of subtask.worklog?.worklogs ?? []) {
      if (worklog.timeSpentSeconds <= NEGLIGIBLE_WORKLOG_SECONDS) continue;
      const person = worklog.author.displayName;
      secondsByPerson.set(person, (secondsByPerson.get(person) ?? 0) + worklog.timeSpentSeconds);
    }
  }

  const roles = new Map<string, DeveloperRole>();
  for (const person of implAssignees) {
    if (!testAssignees.has(person)) roles.set(person, 'dev');
  }
  for (const person of testAssignees) {
    if (!implAssignees.has(person)) roles.set(person, 'tester');
  }
  for (const person of implAssignees) {
    if (testAssignees.has(person)) {
      const implSeconds = implSecondsByPerson.get(person) ?? 0;
      const testSeconds = testSecondsByPerson.get(person) ?? 0;
      roles.set(person, testSeconds > implSeconds ? 'tester' : 'dev');
    }
  }

  return roles;
}
