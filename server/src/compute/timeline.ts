import { addBusinessDays } from './businessDays.js';

const IMPL_SHARE = 0.7;

/** Horas produtivas por dia padrão, usada quando a vertical não configurou o próprio valor. */
export const DEFAULT_HOURS_PER_DAY = 8;

/** Reproduz o comportamento histórico (1,4 PF/dia) quando a vertical não configurou o próprio valor. */
export const DEFAULT_HOURS_PER_PF = DEFAULT_HOURS_PER_DAY / 1.4;

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
 * partir dos Pontos de Função (SP), da data de início real e da produtividade
 * da vertical (horas por PF e horas produtivas por dia, configuráveis — ver
 * Configurações), em dias úteis. Fórmula e arredondamento validados contra o
 * painel original (ver testes).
 */
export function computeTimeline(
  storyPoints: number,
  startISO: string,
  hoursPerPf: number = DEFAULT_HOURS_PER_PF,
  hoursPerDay: number = DEFAULT_HOURS_PER_DAY,
): Timeline {
  const pfPerDay = hoursPerDay / hoursPerPf;
  const totalBusinessDays = Math.ceil(storyPoints / pfPerDay);
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
