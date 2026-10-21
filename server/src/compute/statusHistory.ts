function dateOnly(isoDateTime: string): string {
  return isoDateTime.slice(0, 10);
}

export interface StatusHistorySegment {
  status: string;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
}

/**
 * Reconstrói, por story, quanto tempo ela passou em cada status do fluxo (Ainda não iniciada →
 * Em andamento → Em code review → Ag. início dos testes → Em testes → Aguardando liberação →
 * Concluída), a partir de um punhado de sinais de data/boolean que o resto do sistema já calcula
 * (ver tabela "Mapeamento técnico" da spec). O cursor avança fase a fase: cada fase só gera
 * segmento se a fase anterior de fato aconteceu, e a fase corrente (ainda não fechada) usa
 * `today` como fim provisório.
 */
export function computeStatusHistory(params: {
  storyCreated: string;
  implStartDate: string | null;
  implCodeReviewEnteredAt: string | null;
  implDone: boolean;
  implDoneDate: string | null;
  firstTestWorklogDate: string | null;
  testDone: boolean;
  testDoneDate: string | null;
  isDone: boolean;
  doneTransitionDate: string | null;
  storyUpdated: string;
  today: string;
}): StatusHistorySegment[] {
  const {
    storyCreated,
    implStartDate,
    implCodeReviewEnteredAt,
    implDone,
    implDoneDate,
    firstTestWorklogDate,
    testDone,
    testDoneDate,
    isDone,
    doneTransitionDate,
    storyUpdated,
    today,
  } = params;

  // "Fim atual": enquanto a story não está concluída, qualquer fase em aberto termina hoje; uma
  // vez concluída, a data de referência passa a ser a transição pra Concluída (ou, na falta dela,
  // a última atualização da story).
  const currentEnd = isDone ? dateOnly(doneTransitionDate ?? storyUpdated) : today;

  const segments: StatusHistorySegment[] = [];

  // Os sinais de início/fim de cada fase vêm de fontes de dados diferentes (changelog de
  // subtarefa, worklog, `updated` da story, etc.), então nada garante que cheguem em ordem
  // cronológica — ex.: um worklog de teste lançado com data retroativa. Centralizar o push aqui
  // garante que todo segmento devolvido respeite end >= start; quando os dados já são
  // consistentes isso é um no-op.
  function pushSegment(status: string, start: string, end: string): void {
    segments.push({ status, start, end: end < start ? start : end });
  }

  // 1) Ainda não iniciada
  const notStartedStart = dateOnly(storyCreated);
  if (implStartDate === null) {
    // Cobre tanto a story que nunca começou quanto a anomalia de dado "isDone mas sem
    // implStartDate" — nesse caso não há como saber quando as fases seguintes aconteceram, então
    // devolve só esse segmento em vez de inventar datas.
    pushSegment('Ainda não iniciada', notStartedStart, currentEnd);
    return segments;
  }
  pushSegment('Ainda não iniciada', notStartedStart, implStartDate);

  // 2) Em andamento
  const implEnd = implCodeReviewEnteredAt ?? implDoneDate ?? currentEnd;
  pushSegment('Em andamento', implStartDate, implEnd);

  // 3) Em code review (só existe se a story de fato passou por ali)
  if (implCodeReviewEnteredAt !== null) {
    const codeReviewEnd = implDoneDate ?? currentEnd;
    pushSegment('Em code review', implCodeReviewEnteredAt, codeReviewEnd);
  }
  if (!implDone) return segments;

  // 4) Ag. início dos testes
  const implDoneStart = implDoneDate ?? currentEnd;
  const awaitingTestEnd = firstTestWorklogDate ?? testDoneDate ?? currentEnd;
  pushSegment('Ag. início dos testes', implDoneStart, awaitingTestEnd);
  if (firstTestWorklogDate === null && !testDone) return segments;

  // 5) Em testes (só existe se algum worklog de teste já foi lançado, ou o teste já terminou)
  if (firstTestWorklogDate !== null || testDone) {
    const testStart = firstTestWorklogDate ?? testDoneDate ?? currentEnd;
    const testEnd = testDoneDate ?? currentEnd;
    pushSegment('Em testes', testStart, testEnd);
  }
  if (!testDone) return segments;

  // 6) Aguardando liberação
  const awaitingReleaseStart = testDoneDate ?? currentEnd;
  pushSegment('Aguardando liberação', awaitingReleaseStart, currentEnd);
  if (!isDone) return segments;

  // 7) Concluída
  pushSegment('Concluída', currentEnd, today);

  return segments;
}
