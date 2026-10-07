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

/**
 * Uma atividade foi "adicionada após o início da sprint" quando entrou na sprint atual (via
 * changelog) num dia calendário posterior ao do início dela — herdadas nunca contam aqui, rolar
 * de sprint é continuação do mesmo trabalho, não uma adição nova ao escopo. Ajustes feitos ainda
 * no próprio dia em que a sprint começou (planejamento/grooming de última hora, ou scripts de
 * setup que populam o backlog inicial horas depois do início técnico) não contam como adição,
 * independente de quantas horas depois do início exato aconteceram.
 */
export function isAddedAfterSprintStart(
  isCarriedOver: boolean,
  sprintEnteredAtISO: string | null,
  sprintStartISO: string,
): boolean {
  if (isCarriedOver || sprintEnteredAtISO === null) return false;
  return sprintEnteredAtISO.slice(0, 10) > sprintStartISO.slice(0, 10);
}
