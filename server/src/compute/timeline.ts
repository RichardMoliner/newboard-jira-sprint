import { addBusinessDays } from './businessDays.js';

/** Fração do valor de Implementação (Story Points) acrescida como horas/dias extras de Teste. */
export const TEST_SHARE = 0.3;

/** Horas produtivas por dia padrão, usada quando a sprint não tem o próprio valor configurado (nem salvo, nem enquanto estava em execução). */
export const DEFAULT_HOURS_PER_DAY = 6.5;

/** Horas por Ponto de Função padrão, usada quando a sprint não tem o próprio valor configurado. */
export const DEFAULT_HOURS_PER_PF = 4;

export interface TimelineWindow {
  start: string;
  end: string;
}

export interface Timeline {
  totalBusinessDays: number;
  impl: TimelineWindow;
  test: TimelineWindow;
  /** Horas previstas de cada fase — Implementação é sempre o valor exato do SP e Teste é sempre TEST_SHARE exato em cima dele, independente de como a janela em dias arredondou. */
  implEstimatedHours: number;
  testEstimatedHours: number;
}

/**
 * Projeta a janela de implementação e teste de uma atividade a partir dos
 * Pontos de Função (SP), da data de início real e da produtividade da
 * vertical (horas por PF e horas produtivas por dia, configuráveis — ver
 * Configurações), em dias úteis. O valor em SP representa 100% da
 * Implementação; o Teste é calculado como TEST_SHARE (30%) em cima desse
 * valor, não como uma fração do total. Fórmula e arredondamento validados
 * contra o painel original (ver testes).
 */
export function computeTimeline(
  storyPoints: number,
  startISO: string,
  hoursPerPf: number = DEFAULT_HOURS_PER_PF,
  hoursPerDay: number = DEFAULT_HOURS_PER_DAY,
): Timeline {
  const pfPerDay = hoursPerDay / hoursPerPf;
  const implSteps = Math.max(1, Math.ceil(storyPoints / pfPerDay));
  const testSteps = Math.max(1, Math.ceil(implSteps * TEST_SHARE));
  const totalBusinessDays = implSteps + testSteps;

  const implEnd = addBusinessDays(startISO, implSteps);
  const testEnd = addBusinessDays(implEnd, testSteps);

  const implEstimatedHours = storyPoints * hoursPerPf;

  return {
    totalBusinessDays,
    impl: { start: startISO, end: implEnd },
    test: { start: implEnd, end: testEnd },
    implEstimatedHours,
    testEstimatedHours: implEstimatedHours * TEST_SHARE,
  };
}
