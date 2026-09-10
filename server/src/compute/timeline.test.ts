import { describe, expect, test } from 'vitest';
import { computeTimeline } from './timeline.js';

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
});
