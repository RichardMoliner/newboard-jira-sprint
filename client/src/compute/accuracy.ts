// Espelha server/src/compute/accuracy.ts — ver nota em businessDays.ts sobre a duplicação.

export function computeAccuracyPercent(estimatedHours: number, realizedHours: number): number | null {
  if (estimatedHours <= 0) return null;
  return (realizedHours / estimatedHours) * 100;
}
