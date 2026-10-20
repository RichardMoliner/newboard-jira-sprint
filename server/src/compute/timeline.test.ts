import { describe, expect, test } from 'vitest';
import { businessDaysBetween } from './businessDays.js';
import { computeTimeline, DEFAULT_HOURS_PER_PF, DEFAULT_HOURS_PER_DAY, IMPL_SHARE } from './timeline.js';

function expectHourSplit(result: ReturnType<typeof computeTimeline>, storyPoints: number, hoursPerPf: number) {
  const totalHours = storyPoints * hoursPerPf;
  expect(result.implEstimatedHours).toBeCloseTo(totalHours * IMPL_SHARE);
  expect(result.testEstimatedHours).toBeCloseTo(totalHours * (1 - IMPL_SHARE));
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

// Todos os casos abaixo foram conferidos manualmente contra o painel HTML original
// (painel_sprints_atuais.html), gerado a partir de dados reais do Jira, e recalculados pra bater
// com o padrão atual de produtividade (DEFAULT_HOURS_PER_PF/DAY) — a janela em dias é verificada
// pela contagem de dias úteis (não por datas literais), pra não depender de feriados específicos.
describe('computeTimeline', () => {
  test('15.5 SP a partir de 03/09, produtividade padrão', () => {
    const result = computeTimeline(15.5, '2026-09-03');
    // pfPerDay = 6.5/4 = 1.625 -> total = ceil(15.5/1.625) = 10 dias úteis; 70/30 -> round(10*0.7)=7 Impl, 3 Teste.
    expectDaySplit(result, '2026-09-03', 7, 3);
    expectHourSplit(result, 15.5, DEFAULT_HOURS_PER_PF);
  });

  test('6 SP a partir de 04/09, produtividade padrão', () => {
    const result = computeTimeline(6, '2026-09-04');
    // total = ceil(6/1.625) = 4 dias úteis; 70/30 -> round(4*0.7)=3 Impl, 1 Teste.
    expectDaySplit(result, '2026-09-04', 3, 1);
    expectHourSplit(result, 6, DEFAULT_HOURS_PER_PF);
  });

  test('2.1 SP a partir de 04/09, produtividade padrão', () => {
    const result = computeTimeline(2.1, '2026-09-04');
    // total = ceil(2.1/1.625) = 2 dias úteis; 70/30 -> round(2*0.7)=1 Impl, 1 Teste.
    expectDaySplit(result, '2026-09-04', 1, 1);
    expectHourSplit(result, 2.1, DEFAULT_HOURS_PER_PF);
  });

  test('18 SP a partir de 04/09, produtividade padrão', () => {
    const result = computeTimeline(18, '2026-09-04');
    // total = ceil(18/1.625) = 12 dias úteis; 70/30 -> round(12*0.7)=8 Impl, 4 Teste.
    expectDaySplit(result, '2026-09-04', 8, 4);
    expectHourSplit(result, 18, DEFAULT_HOURS_PER_PF);
  });

  test('10 SP a partir de 04/09, produtividade padrão', () => {
    const result = computeTimeline(10, '2026-09-04');
    // total = ceil(10/1.625) = 7 dias úteis; 70/30 -> round(7*0.7)=5 Impl, 2 Teste.
    expectDaySplit(result, '2026-09-04', 5, 2);
    expectHourSplit(result, 10, DEFAULT_HOURS_PER_PF);
  });

  test('respects a custom hoursPerPf instead of the default vertical productivity', () => {
    // 16h por PF com 6.5h/dia (padrão) = 0,40625 PF/dia útil para os mesmos 6 SP.
    const result = computeTimeline(6, '2026-09-04', 16);
    // total = ceil(6/0.40625) = 15 dias úteis; 70/30 -> round(15*0.7)=11 Impl, 4 Teste.
    expectDaySplit(result, '2026-09-04', 11, 4);
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

  // A janela em dias inteiros aplica 70/30 sobre o total de dias úteis, não sobre as horas
  // diretamente — para tarefas grandes isso já se aproxima bem do 70/30, mas as horas exibidas
  // (Impl./Teste (h), Assertividade, % de Teste) precisam ser exatas mesmo quando a janela em dias
  // não fecha exatamente nessa proporção.
  test('implEstimatedHours/testEstimatedHours are the exact 70/30 split of the total estimate, not derived from the rounded day window', () => {
    // 10 PF x 4h/PF = 40h totais -> split exato: 28h Impl, 12h Teste.
    const result = computeTimeline(10, '2026-09-04', 4, 6.5);
    expect(result.implEstimatedHours).toBeCloseTo(28);
    expect(result.testEstimatedHours).toBeCloseTo(12);
  });

  // Tarefas bem pequenas (poucos dias úteis) faziam o arredondamento por dia inteiro zerar
  // completamente a janela de Teste (ex.: COM-66868, 1.25 PF -> 1 dia útil total, 100% Implementação
  // e 0 dias de Teste) — a barra de Teste simplesmente não aparecia na timeline.
  test('guarantees at least 1 business day for each phase, even for a task whose total rounds to a single day', () => {
    // 1.25 PF / (6.5h/4h por PF) = 0.77 dias -> arredonda pra 1 dia útil total sem a garantia;
    // com a garantia, cresce para 2 dias úteis (1 Implementação + 1 Teste).
    const result = computeTimeline(1.25, '2026-09-04', 4, 6.5);
    expectDaySplit(result, '2026-09-04', 1, 1);
  });

  test('the minimum-1-day guarantee does not affect implEstimatedHours/testEstimatedHours, which stay the exact proportional split', () => {
    const result = computeTimeline(1.25, '2026-09-04', 4, 6.5);
    // 1.25 PF x 4h/PF = 5h totais -> split exato: 3.5h Impl, 1.5h Teste (não 6h30/6h30).
    expect(result.implEstimatedHours).toBeCloseTo(3.5);
    expect(result.testEstimatedHours).toBeCloseTo(1.5);
  });

  test('does not need the minimum-day guarantee once the total is 2 business days or more', () => {
    const result = computeTimeline(2.1, '2026-09-04', 4, 6.5);
    expect(result.totalBusinessDays).toBe(2);
  });
});
