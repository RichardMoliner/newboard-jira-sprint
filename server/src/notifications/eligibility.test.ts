import { describe, test, expect } from 'vitest';
import { Activity } from '../domain/types.js';
import {
  isEligibleForEarlyDeliveryNotification,
  daysBetween,
  computeDueNotifications,
  getNotifiedMilestones,
  DueNotification,
  NotifiedState,
} from './eligibility.js';

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    key: 'PROJ-1',
    url: 'https://jira/PROJ-1',
    title: 'Tarefa',
    sprintId: 's1',
    sprintName: 'Sprint 1',
    isCarried: false,
    developer: 'Fulano',
    tester: null,
    storyPoints: null,
    startDate: '2026-10-01',
    dueDate: null,
    deliveredDate: null,
    deliveredOnTime: null,
    assertividadePercent: null,
    assertividadeComBugsPercent: null,
    status: 'Em andamento',
    isDone: false,
    isOverdue: false,
    notStarted: false,
    implDone: false,
    implDoneDate: null,
    testDone: false,
    implWindow: null,
    testWindow: null,
    statusHistory: [],
    implEstimatedHours: null,
    testEstimatedHours: null,
    implLoggedHours: null,
    testLoggedHours: null,
    bugsLoggedHours: null,
    implBugsLoggedHours: null,
    testBugsLoggedHours: null,
    worklogEntries: [],
    bugs: [],
    addedAfterSprintStart: false,
    sprintEnteredAt: null,
    notImpactsDeploy: false,
    earlyDelivery: true,
    featureFlag: false,
    legalRequirement: null,
    legalDeadline: '2026-10-27',
    ...overrides,
  };
}

describe('isEligibleForEarlyDeliveryNotification', () => {
  test('elegível quando earlyDelivery, legalDeadline definido, não testDone, não isDone', () => {
    expect(isEligibleForEarlyDeliveryNotification(activity())).toBe(true);
  });

  test('não elegível sem earlyDelivery', () => {
    expect(isEligibleForEarlyDeliveryNotification(activity({ earlyDelivery: false }))).toBe(false);
  });

  test('não elegível sem legalDeadline', () => {
    expect(isEligibleForEarlyDeliveryNotification(activity({ legalDeadline: null }))).toBe(false);
  });

  test('não elegível quando testDone (Aguardando liberação)', () => {
    expect(isEligibleForEarlyDeliveryNotification(activity({ testDone: true }))).toBe(false);
  });

  test('não elegível quando isDone (Atendida)', () => {
    expect(isEligibleForEarlyDeliveryNotification(activity({ isDone: true, testDone: true }))).toBe(false);
  });

  test('não elegível quando status é Não atendida, mesmo com isDone false', () => {
    expect(isEligibleForEarlyDeliveryNotification(activity({ status: 'Não atendida' }))).toBe(false);
  });
});

describe('computeDueNotifications', () => {
  test('tarefa nunca avisada, 5 dias restantes exatos, dispara só o marco 5', () => {
    const act = activity({ legalDeadline: '2026-10-27' });
    const result = computeDueNotifications([act], '2026-10-22', {});
    expect(result).toEqual([{ activity: act, milestone: 5, daysRemaining: 5 }]);
  });

  test('checagem pulou dias: 7 restantes na última vez, hoje 2 restantes, dispara 5 e 3 juntos (nenhum avisado ainda)', () => {
    const act = activity({ legalDeadline: '2026-10-24' }); // hoje + 2
    const result = computeDueNotifications([act], '2026-10-22', {});
    expect(result.map((r) => r.milestone)).toEqual([5, 3]);
  });

  test('marco já avisado para o legalDeadline atual não repete', () => {
    const act = activity({ legalDeadline: '2026-10-27' });
    const state = { [act.key]: { legalDeadline: '2026-10-27', milestones: [5] } };
    const result = computeDueNotifications([act], '2026-10-22', state);
    expect(result).toEqual([]);
  });

  test('prazo já vencido e nunca avisado dispara só o marco 0, não 5/3/1', () => {
    const act = activity({ legalDeadline: '2026-10-19' }); // hoje - 3
    const result = computeDueNotifications([act], '2026-10-22', {});
    expect(result.map((r) => r.milestone)).toEqual([0]);
  });

  test('legalDeadline mudou depois de marcos avisados para a data antiga: marcos voltam a valer', () => {
    const act = activity({ legalDeadline: '2026-11-15' });
    const state = { [act.key]: { legalDeadline: '2026-10-30', milestones: [5, 3] } };
    const result = computeDueNotifications([act], '2026-10-22', state);
    expect(result).toEqual([]); // faltam 24 dias pra nova data — nenhum marco atingido ainda, mas não bloqueado
  });

  test('tarefa não elegível não aparece mesmo com legalDeadline próximo', () => {
    const act = activity({ legalDeadline: '2026-10-22', isDone: true, testDone: true });
    expect(computeDueNotifications([act], '2026-10-22', {})).toEqual([]);
  });
});
