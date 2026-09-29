import { describe, expect, test } from 'vitest';
import { describeBugLabel } from './bugLabels.js';

describe('describeBugLabel', () => {
  test.each([
    ['bug_alteracao_requisito', 'Alteração de requisito'],
    ['bug_requisito_nao_implementado', 'Requisito não implementado'],
    ['bug_prototipo_nao_atendido', 'Protótipo não atendido'],
    ['bug_devolvido', 'Devolvido'],
    ['bug_liberacao_nao_validada', 'Liberação não validada'],
    ['bug_impeditivo', 'Impeditivo'],
  ])('translates known label %s to "%s"', (raw, expectedText) => {
    expect(describeBugLabel(raw).text).toBe(expectedText);
  });

  test('assigns a distinct color to each known label', () => {
    const colors = new Set(
      ['bug_alteracao_requisito', 'bug_requisito_nao_implementado', 'bug_prototipo_nao_atendido', 'bug_devolvido', 'bug_liberacao_nao_validada', 'bug_impeditivo'].map(
        (label) => describeBugLabel(label).color,
      ),
    );
    expect(colors.size).toBe(6);
  });

  test('falls back to a stripped, capitalized version of an unknown label', () => {
    expect(describeBugLabel('bug_algo_novo').text).toBe('Algo novo');
  });

  test('falls back gracefully for a label without the "bug_" prefix', () => {
    expect(describeBugLabel('outro_rotulo').text).toBe('Outro rotulo');
  });
});
