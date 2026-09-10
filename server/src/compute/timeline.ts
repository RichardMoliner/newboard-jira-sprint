import { addBusinessDays } from './businessDays.js';

const PF_PER_DAY = 1.4;
const IMPL_SHARE = 0.7;

export interface TimelineWindow {
  start: string;
  end: string;
}

export interface Timeline {
  totalBusinessDays: number;
  impl: TimelineWindow;
  test: TimelineWindow;
}

/**
 * Projeta a janela de implementação (70%) e teste (30%) de uma atividade a
 * partir dos Pontos de Função (SP) e da data de início real, em dias úteis.
 * Fórmula e arredondamento validados contra o painel original (ver testes).
 */
export function computeTimeline(storyPoints: number, startISO: string): Timeline {
  const totalBusinessDays = Math.ceil(storyPoints / PF_PER_DAY);
  const implSteps = Math.round(totalBusinessDays * IMPL_SHARE);
  const testSteps = totalBusinessDays - implSteps;

  const implEnd = addBusinessDays(startISO, implSteps);
  const testEnd = addBusinessDays(implEnd, testSteps);

  return {
    totalBusinessDays,
    impl: { start: startISO, end: implEnd },
    test: { start: implEnd, end: testEnd },
  };
}
