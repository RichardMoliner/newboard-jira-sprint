import { describe, expect, test } from 'vitest';
import { inferDeveloperRoles } from './inferRoles.js';
import type { RawSubtask } from './groupSubtasks.js';

function subtask(overrides: Partial<RawSubtask>): RawSubtask {
  return {
    key: 'EC-1',
    summary: 'Implementação: * Algo',
    status: 'Em andamento',
    type: 'Implementação',
    assignee: 'Fulano',
    created: '2026-08-04T17:43:32.000-0300',
    updated: '2026-09-04T14:17:29.000-0300',
    parent: { key: 'EC-11420' },
    ...overrides,
  };
}

function worklog(author: string, hours: number) {
  return { author: { displayName: author }, started: '2026-09-08T00:00:00.000-0300', timeSpentSeconds: hours * 3600 };
}

describe('inferDeveloperRoles', () => {
  test('classifica quem só é responsável por subtarefas de Implementação como dev', () => {
    const roles = inferDeveloperRoles([subtask({ type: 'Implementação', assignee: 'Ana' })]);
    expect(roles.get('Ana')).toBe('dev');
  });

  test('classifica quem só é responsável por subtarefas de Teste como tester', () => {
    const roles = inferDeveloperRoles([subtask({ type: 'Teste', assignee: 'Bia' })]);
    expect(roles.get('Bia')).toBe('tester');
  });

  test('ignora subtarefas de Bug para a classificação', () => {
    const roles = inferDeveloperRoles([subtask({ type: 'Bug', assignee: 'Carlos' })]);
    expect(roles.has('Carlos')).toBe(false);
  });

  test('desempata por horas apontadas quando a pessoa é responsável pelos dois tipos, tester vence', () => {
    const roles = inferDeveloperRoles([
      subtask({ type: 'Implementação', assignee: 'Duda', worklog: { worklogs: [worklog('Duda', 1)] } }),
      subtask({ type: 'Teste', assignee: 'Duda', worklog: { worklogs: [worklog('Duda', 5)] } }),
    ]);
    expect(roles.get('Duda')).toBe('tester');
  });

  test('desempata por horas apontadas quando a pessoa é responsável pelos dois tipos, dev vence', () => {
    const roles = inferDeveloperRoles([
      subtask({ type: 'Implementação', assignee: 'Duda', worklog: { worklogs: [worklog('Duda', 5)] } }),
      subtask({ type: 'Teste', assignee: 'Duda', worklog: { worklogs: [worklog('Duda', 1)] } }),
    ]);
    expect(roles.get('Duda')).toBe('dev');
  });

  test('empate exato nas horas vira dev', () => {
    const roles = inferDeveloperRoles([
      subtask({ type: 'Implementação', assignee: 'Duda', worklog: { worklogs: [worklog('Duda', 3)] } }),
      subtask({ type: 'Teste', assignee: 'Duda', worklog: { worklogs: [worklog('Duda', 3)] } }),
    ]);
    expect(roles.get('Duda')).toBe('dev');
  });

  test('apontamentos de 5 minutos ou menos não contam para o desempate', () => {
    const roles = inferDeveloperRoles([
      subtask({ type: 'Implementação', assignee: 'Duda', worklog: { worklogs: [worklog('Duda', 0.05)] } }),
      subtask({ type: 'Teste', assignee: 'Duda', worklog: { worklogs: [worklog('Duda', 1)] } }),
    ]);
    expect(roles.get('Duda')).toBe('tester');
  });
});
