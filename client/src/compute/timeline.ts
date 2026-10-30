// Espelha server/src/compute/timeline.ts — ver nota em businessDays.ts sobre a duplicação.

import { addBusinessDays } from '../businessDays.js';

export const IMPL_SHARE = 0.7;

export interface TimelineWindow {
  start: string;
  end: string;
}

export interface Timeline {
  totalBusinessDays: number;
  impl: TimelineWindow;
  test: TimelineWindow;
  implEstimatedHours: number;
  testEstimatedHours: number;
}

/**
 * Projeta a janela de implementação (70%) e teste (30%) de uma atividade a
 * partir dos Pontos de Função (SP), da data de início real e da produtividade
 * da vertical (horas por PF e horas produtivas por dia).
 */
export function computeTimeline(storyPoints: number, startISO: string, hoursPerPf: number, hoursPerDay: number): Timeline {
  const pfPerDay = hoursPerDay / hoursPerPf;
  const rawTotalBusinessDays = Math.ceil(storyPoints / pfPerDay);
  let implSteps = Math.round(rawTotalBusinessDays * IMPL_SHARE);
  let testSteps = rawTotalBusinessDays - implSteps;
  if (implSteps < 1) implSteps = 1;
  if (testSteps < 1) testSteps = 1;
  const totalBusinessDays = implSteps + testSteps;

  const implEnd = addBusinessDays(startISO, implSteps);
  const testEnd = addBusinessDays(implEnd, testSteps);

  const totalEstimatedHours = storyPoints * hoursPerPf;

  return {
    totalBusinessDays,
    impl: { start: startISO, end: implEnd },
    test: { start: implEnd, end: testEnd },
    implEstimatedHours: totalEstimatedHours * IMPL_SHARE,
    testEstimatedHours: totalEstimatedHours * (1 - IMPL_SHARE),
  };
}
