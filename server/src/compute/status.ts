/** Uma atividade é "herdada" quando seu início real é anterior ao início da sprint atual. */
export function isCarried(realStartISO: string, sprintStartISO: string): boolean {
  return realStartISO < sprintStartISO;
}

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
