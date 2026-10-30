import { describe, expect, test } from 'vitest';
import { recomputeActivityForSprintSettings } from './recomputeActivity.js';
import type { Activity } from '../types.js';

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    key: 'EC-1',
    url: 'https://desenv.betha.com.br/browse/EC-1',
    title: 'Atividade',
    sprintId: '7590',
    sprintName: 'ALM S09 2026 Edital',
    isCarried: false,
    developer: 'Fulano',
    tester: 'Ciclana',
    storyPoints: 5,
    startDate: '2026-09-03',
    dueDate: '2026-09-10',
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
    earlyDelivery: false,
    featureFlag: false,
    legalRequirement: null,
    legalDeadline: null,
    ...overrides,
  };
}

describe('recomputeActivityForSprintSettings', () => {
  test('recalcula janelas e horas estimadas com o novo horas/PF, sem tocar em campos vindos do Jira', () => {
    const original = activity({ storyPoints: 8, startDate: '2026-09-01' });

    const recomputed = recomputeActivityForSprintSettings(original, '2026-09-05', 4, 6.5);

    expect(recomputed.implWindow).not.toBeNull();
    expect(recomputed.testWindow).not.toBeNull();
    expect(recomputed.dueDate).toBe(recomputed.testWindow?.end);
    expect(recomputed.implEstimatedHours).toBeCloseTo(8 * 4 * 0.7);
    expect(recomputed.testEstimatedHours).toBeCloseTo(8 * 4 * 0.3);
    // campos que não dependem de horas/PF continuam intocados
    expect(recomputed.key).toBe(original.key);
    expect(recomputed.developer).toBe(original.developer);
    expect(recomputed.worklogEntries).toBe(original.worklogEntries);
  });

  test('um horas/PF maior projeta um prazo mais distante e deixa de estar atrasada', () => {
    const original = activity({ storyPoints: 8, startDate: '2026-09-01', isOverdue: true });

    const comPrazoApertado = recomputeActivityForSprintSettings(original, '2026-09-10', 4, 6.5);
    const comPrazoFolgado = recomputeActivityForSprintSettings(original, '2026-09-10', 10, 6.5);

    expect(comPrazoApertado.dueDate! < comPrazoFolgado.dueDate!).toBe(true);
    expect(comPrazoFolgado.isOverdue).toBe(false);
  });

  test('atividade ainda não iniciada (sem subtarefa de Implementação) continua sem janela nem prazo', () => {
    const original = activity({ notStarted: true, storyPoints: 5 });

    const recomputed = recomputeActivityForSprintSettings(original, '2026-09-05', 4, 6.5);

    expect(recomputed.implWindow).toBeNull();
    expect(recomputed.testWindow).toBeNull();
    expect(recomputed.dueDate).toBeNull();
    expect(recomputed.isOverdue).toBe(false);
  });

  test('recalcula assertividade (com e sem bugs) de uma atividade concluída', () => {
    const original = activity({
      storyPoints: 4,
      startDate: '2026-09-01',
      isDone: true,
      implLoggedHours: 10,
      testLoggedHours: 5,
      bugsLoggedHours: 3,
      deliveredDate: '2026-09-08',
    });

    const recomputed = recomputeActivityForSprintSettings(original, '2026-09-10', 4, 6.5);

    // estimativa total = 4 PF * 4h/PF = 16h; realizado sem bugs = 15h; com bugs = 18h
    expect(recomputed.assertividadePercent).toBeCloseTo((15 / 16) * 100);
    expect(recomputed.assertividadeComBugsPercent).toBeCloseTo((18 / 16) * 100);
    expect(recomputed.deliveredOnTime).toBe(recomputed.deliveredDate! <= recomputed.dueDate!);
  });

  test('atividade não concluída e sem apontamento nenhum continua sem % de assertividade', () => {
    const original = activity({ storyPoints: 4, startDate: '2026-09-01', isDone: false, testDone: false });

    const recomputed = recomputeActivityForSprintSettings(original, '2026-09-05', 4, 6.5);

    expect(recomputed.assertividadePercent).toBeNull();
    expect(recomputed.assertividadeComBugsPercent).toBeNull();
  });
});
