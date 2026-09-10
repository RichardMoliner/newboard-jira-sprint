/**
 * Percentual de assertividade: realizado / estimado. 100% quando batem exatamente; abaixo de
 * 100% a tarefa foi concluída mais rápido que o estimado (superestimamos); acima de 100%, levou
 * mais tempo que o estimado (subestimamos).
 */
export function computeAccuracyPercent(estimatedHours: number, realizedHours: number): number | null {
  if (estimatedHours <= 0) return null;
  return (realizedHours / estimatedHours) * 100;
}
