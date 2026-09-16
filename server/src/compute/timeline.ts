import { addBusinessDays } from './businessDays.js';

/** Fração do prazo total (dias úteis) reservada para Implementação ao projetar a janela prevista; o restante (1 - IMPL_SHARE) vai para Teste. */
export const IMPL_SHARE = 0.7;

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
  /** Horas previstas de cada fase — sempre a fração exata (IMPL_SHARE) da estimativa total, independente de como a janela em dias arredondou. */
  implEstimatedHours: number;
  testEstimatedHours: number;
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
  const rawTotalBusinessDays = Math.ceil(storyPoints / pfPerDay);
  let implSteps = Math.round(rawTotalBusinessDays * IMPL_SHARE);
  let testSteps = rawTotalBusinessDays - implSteps;
  // Arredondar 70/30 para dias úteis inteiros zera uma das fases quando o total é muito pequeno
  // (ex.: 1 dia útil vira 100% Implementação, 0 dias de Teste) — a barra daquela fase some da
  // timeline. Garante pelo menos 1 dia útil visível pra cada fase, crescendo o total se precisar.
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
