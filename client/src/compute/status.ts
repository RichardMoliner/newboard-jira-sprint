// Espelha (parcialmente) server/src/compute/status.ts — ver nota em businessDays.ts sobre a
// duplicação. Só as funções usadas pelo recompute local de horas/PF (recomputeActivity.ts).

/** Uma atividade está "atrasada" quando tem previsão vencida e ainda não foi concluída. */
export function isOverdue(dueDateISO: string | null, isDone: boolean, todayISO: string): boolean {
  if (isDone || dueDateISO === null) return false;
  return dueDateISO < todayISO;
}

/** Uma atividade concluída foi "entregue no prazo" quando a entrega ocorreu até a previsão; null quando falta uma das datas para comparar. */
export function isDeliveredOnTime(deliveredDateISO: string | null, dueDateISO: string | null): boolean | null {
  if (deliveredDateISO === null || dueDateISO === null) return null;
  return deliveredDateISO <= dueDateISO;
}
