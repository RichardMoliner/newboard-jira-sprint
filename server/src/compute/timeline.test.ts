import { describe, expect, test } from 'vitest';
import { computeTimeline, DEFAULT_HOURS_PER_PF, DEFAULT_HOURS_PER_DAY } from './timeline.js';

// Todos os casos abaixo foram conferidos manualmente contra o painel HTML original
// (painel_sprints_atuais.html), gerado a partir de dados reais do Jira.
describe('computeTimeline', () => {
  test('15.5 SP a partir de 03/09 (EC-11739)', () => {
    expect(computeTimeline(15.5, '2026-09-03')).toEqual({
      totalBusinessDays: 12,
      impl: { start: '2026-09-03', end: '2026-09-16' },
      test: { start: '2026-09-16', end: '2026-09-22' },
    });
  });

  test('6 SP a partir de 04/09 (COM-66032)', () => {
    expect(computeTimeline(6, '2026-09-04')).toEqual({
      totalBusinessDays: 5,
      impl: { start: '2026-09-04', end: '2026-09-11' },
      test: { start: '2026-09-11', end: '2026-09-14' },
    });
  });

  test('2.1 SP a partir de 04/09 (COM-65758)', () => {
    expect(computeTimeline(2.1, '2026-09-04')).toEqual({
      totalBusinessDays: 2,
      impl: { start: '2026-09-04', end: '2026-09-08' },
      test: { start: '2026-09-08', end: '2026-09-09' },
    });
  });

  test('18 SP a partir de 04/09 (COM-55616)', () => {
    expect(computeTimeline(18, '2026-09-04')).toEqual({
      totalBusinessDays: 13,
      impl: { start: '2026-09-04', end: '2026-09-18' },
      test: { start: '2026-09-18', end: '2026-09-24' },
    });
  });

  test('10 SP a partir de 04/09 (COM-66352)', () => {
    expect(computeTimeline(10, '2026-09-04')).toEqual({
      totalBusinessDays: 8,
      impl: { start: '2026-09-04', end: '2026-09-15' },
      test: { start: '2026-09-15', end: '2026-09-17' },
    });
  });

  test('respects a custom hoursPerPf instead of the default vertical productivity', () => {
    // 16h por PF = 0,5 PF/dia útil — metade da produtividade padrão (~1,4 PF/dia) para os mesmos 6 SP.
    expect(computeTimeline(6, '2026-09-04', 16)).toEqual({
      totalBusinessDays: 12,
      impl: { start: '2026-09-04', end: '2026-09-17' },
      test: { start: '2026-09-17', end: '2026-09-23' },
    });
  });

  test('omitting hoursPerPf matches passing DEFAULT_HOURS_PER_PF explicitly', () => {
    expect(computeTimeline(6, '2026-09-04')).toEqual(computeTimeline(6, '2026-09-04', DEFAULT_HOURS_PER_PF));
  });

  test('respects a custom hoursPerDay — fewer productive hours per day stretches the same PF over more calendar days', () => {
    // 4h produtivas/dia com 8h por PF = 0,5 PF/dia útil — mesma produtividade resultante do caso de hoursPerPf=16 acima.
    expect(computeTimeline(6, '2026-09-04', 8, 4)).toEqual(computeTimeline(6, '2026-09-04', 16));
  });

  test('omitting hoursPerDay matches passing DEFAULT_HOURS_PER_DAY explicitly', () => {
    expect(computeTimeline(6, '2026-09-04', DEFAULT_HOURS_PER_PF)).toEqual(
      computeTimeline(6, '2026-09-04', DEFAULT_HOURS_PER_PF, DEFAULT_HOURS_PER_DAY),
    );
  });
});
