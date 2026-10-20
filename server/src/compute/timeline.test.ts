import { describe, expect, test } from 'vitest';
import { businessDaysBetween } from './businessDays.js';
import { computeTimeline, DEFAULT_HOURS_PER_PF, DEFAULT_HOURS_PER_DAY, TEST_SHARE } from './timeline.js';

function expectHourSplit(result: ReturnType<typeof computeTimeline>, storyPoints: number, hoursPerPf: number) {
  const implHours = storyPoints * hoursPerPf;
  expect(result.implEstimatedHours).toBeCloseTo(implHours);
  expect(result.testEstimatedHours).toBeCloseTo(implHours * TEST_SHARE);
}

function expectDaySplit(
  result: ReturnType<typeof computeTimeline>,
  startISO: string,
  implDays: number,
  testDays: number,
) {
  expect(result.impl).toEqual({ start: startISO, end: result.impl.end });
  expect(result.test).toEqual({ start: result.impl.end, end: result.test.end });
  expect(businessDaysBetween(startISO, result.impl.end)).toBe(implDays);
  expect(businessDaysBetween(result.impl.end, result.test.end)).toBe(testDays);
  expect(result.totalBusinessDays).toBe(implDays + testDays);
}

// O valor em Story Points (SP) representa 100% da Implementação. O Teste não divide esse total —
// ele é calculado como TEST_SHARE (30%) ADICIONAL em cima da Implementação (ver TEST_SHARE em
// timeline.ts). Os casos abaixo foram recalculados a partir dos originais (que tratavam SP como
// 100% do total, dividido 70/30) após essa mudança de regra.
describe('computeTimeline', () => {
  test('15.5 SP a partir de 03/09 (EC-11739)', () => {
    const result = computeTimeline(15.5, '2026-09-03');
    // pfPerDay = 6.5/4 = 1.625 -> implDays = ceil(15.5/1.625) = 10; testDays = ceil(10*0.3) = 3.
    expectDaySplit(result, '2026-09-03', 10, 3);
    expectHourSplit(result, 15.5, DEFAULT_HOURS_PER_PF);
  });

  test('6 SP a partir de 04/09 (COM-66032)', () => {
    const result = computeTimeline(6, '2026-09-04');
    // implDays = ceil(6/1.625) = 4; testDays = ceil(4*0.3) = 2.
    expectDaySplit(result, '2026-09-04', 4, 2);
    expectHourSplit(result, 6, DEFAULT_HOURS_PER_PF);
  });

  test('2.1 SP a partir de 04/09 (COM-65758)', () => {
    const result = computeTimeline(2.1, '2026-09-04');
    // implDays = ceil(2.1/1.625) = 2; testDays = ceil(2*0.3) = 1.
    expectDaySplit(result, '2026-09-04', 2, 1);
    expectHourSplit(result, 2.1, DEFAULT_HOURS_PER_PF);
  });

  test('18 SP a partir de 04/09 (COM-55616)', () => {
    const result = computeTimeline(18, '2026-09-04');
    // implDays = ceil(18/1.625) = 12; testDays = ceil(12*0.3) = 4.
    expectDaySplit(result, '2026-09-04', 12, 4);
    expectHourSplit(result, 18, DEFAULT_HOURS_PER_PF);
  });

  test('10 SP a partir de 04/09 (COM-66352)', () => {
    const result = computeTimeline(10, '2026-09-04');
    // implDays = ceil(10/1.625) = 7; testDays = ceil(7*0.3) = 3.
    expectDaySplit(result, '2026-09-04', 7, 3);
    expectHourSplit(result, 10, DEFAULT_HOURS_PER_PF);
  });

  test('respects a custom hoursPerPf instead of the default vertical productivity', () => {
    // 16h por PF com 6.5h/dia (padrão) = 0,40625 PF/dia útil para os mesmos 6 SP.
    const result = computeTimeline(6, '2026-09-04', 16);
    // implDays = ceil(6/0.40625) = 15; testDays = ceil(15*0.3) = 5.
    expectDaySplit(result, '2026-09-04', 15, 5);
    expectHourSplit(result, 6, 16);
  });

  test('omitting hoursPerPf matches passing DEFAULT_HOURS_PER_PF explicitly', () => {
    expect(computeTimeline(6, '2026-09-04')).toEqual(computeTimeline(6, '2026-09-04', DEFAULT_HOURS_PER_PF));
  });

  test('respects a custom hoursPerDay — fewer productive hours per day stretches the same PF over more calendar days', () => {
    // 4h produtivas/dia com 8h por PF = 0,5 PF/dia útil — mesma produtividade resultante do caso de
    // hoursPerPf=16 com hoursPerDay=8 (ambos explícitos, não dependem do padrão do sistema), logo o
    // mesmo CRONOGRAMA (dias úteis) — mas as horas totais previstas são diferentes (6 SP x 8h/PF =
    // 48h aqui, vs. 6 SP x 16h/PF = 96h no outro caso), então só compara o cronograma, não o objeto inteiro.
    const a = computeTimeline(6, '2026-09-04', 8, 4);
    const b = computeTimeline(6, '2026-09-04', 16, 8);
    expect(a.totalBusinessDays).toBe(b.totalBusinessDays);
    expect(a.impl).toEqual(b.impl);
    expect(a.test).toEqual(b.test);
  });

  test('omitting hoursPerDay matches passing DEFAULT_HOURS_PER_DAY explicitly', () => {
    expect(computeTimeline(6, '2026-09-04', DEFAULT_HOURS_PER_PF)).toEqual(
      computeTimeline(6, '2026-09-04', DEFAULT_HOURS_PER_PF, DEFAULT_HOURS_PER_DAY),
    );
  });

  // implEstimatedHours é sempre o valor exato do SP (Implementação = 100% do SP) e
  // testEstimatedHours é sempre TEST_SHARE (30%) exato em cima dele — não derivados da janela em
  // dias úteis arredondada. As horas exibidas (Impl./Teste (h), Assertividade, % de Teste) precisam
  // ser exatas mesmo quando a janela em dias não fecha exatamente nessa proporção.
  test('implEstimatedHours is the exact SP value and testEstimatedHours is the exact 30% on top of it, not derived from the rounded day window', () => {
    // 10 PF x 4h/PF = 40h de Implementação -> 40h Impl, 12h Teste (40 x 0.3).
    const result = computeTimeline(10, '2026-09-04', 4, 6.5);
    expect(result.implEstimatedHours).toBeCloseTo(40);
    expect(result.testEstimatedHours).toBeCloseTo(12);
  });

  // Com implDays = ceil(storyPoints / pfPerDay), a Implementação já nunca arredonda para 0 dias
  // (storyPoints > 0 sempre produz pelo menos 1 dia útil); e como o Teste é ceil(implDays * 0.3),
  // ele também nunca zera para implDays >= 1 (ceil(0.3) = 1). A garantia de mínimo de 1 dia útil por
  // fase continua valendo, mas agora decorre naturalmente da fórmula em vez de um ajuste manual.
  test('guarantees at least 1 business day for each phase, even for a task whose implementation rounds to a single day', () => {
    // 1.25 PF / (6.5h/4h por PF) = 0.77 dias -> implDays = ceil(0.77) = 1; testDays = ceil(1*0.3) = 1.
    const result = computeTimeline(1.25, '2026-09-04', 4, 6.5);
    expectDaySplit(result, '2026-09-04', 1, 1);
  });

  test('the minimum-1-day guarantee does not affect implEstimatedHours/testEstimatedHours, which stay the exact proportional split', () => {
    const result = computeTimeline(1.25, '2026-09-04', 4, 6.5);
    // 1.25 PF x 4h/PF = 5h de Implementação -> 5h Impl, 1.5h Teste (5 x 0.3).
    expect(result.implEstimatedHours).toBeCloseTo(5);
    expect(result.testEstimatedHours).toBeCloseTo(1.5);
  });

  test('implementation window never needs the minimum-day guarantee once it is 2 business days or more', () => {
    const result = computeTimeline(2.1, '2026-09-04', 4, 6.5);
    // implDays = ceil(2.1/1.625) = 2 (>= 1 without the guarantee kicking in).
    expect(businessDaysBetween('2026-09-04', result.impl.end)).toBe(2);
  });
});
