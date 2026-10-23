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
 * Em andamento → Em code review → Ag. início dos testes → Em testes → Correção de bugs → Teste de
 * bugs → Aguardando liberação → Concluída), a partir de um punhado de sinais de data/boolean que o
 * resto do sistema já calcula (ver tabela "Mapeamento técnico" da spec). O cursor avança fase a
 * fase: cada fase só gera segmento se a fase anterior de fato aconteceu, e a fase corrente (ainda
 * não fechada) usa `today` como fim provisório — exceto "Correção de bugs" e "Teste de bugs", que
 * não são fases do fluxo do Jira: são períodos derivados dos apontamentos do dev/tester nos bugs
 * da story, sempre janelas já fechadas.
 */
export function computeStatusHistory(params: {
  storyCreated: string;
  /** Timestamp ISO de quando a issue entrou na sprint ATUAL (via changelog); null sem esse
   * histórico (ex.: story criada já dentro da sprint, sem evento de mudança do campo Sprint). */
  sprintEnteredAt: string | null;
  /** True quando a story já veio de uma sprint anterior (rolou pra sprint atual) — nesse caso o
   * início de "Ainda não iniciada" usa `storyCreated`, não `sprintEnteredAt`, pra não resetar o
   * relógio de espera real a cada sprint que a story atravessa. */
  isCarried: boolean;
  /** Data (YYYY-MM-DD) em que o status da PRÓPRIA story mudou pra "Em andamento" no Jira (via
   * changelog, não derivado de subtarefa); null se isso nunca aconteceu literalmente (comum quando
   * o progresso é só acompanhado pelas subtarefas, sem mexer no status da story-mãe) — nesse caso
   * cai pro `implStartDate` como antes. */
  emAndamentoEnteredAt: string | null;
  implStartDate: string | null;
  implCodeReviewEnteredAt: string | null;
  implDone: boolean;
  implDoneDate: string | null;
  firstTestWorklogDate: string | null;
  testDone: boolean;
  testDoneDate: string | null;
  /** Data (YYYY-MM-DD) do primeiro apontamento do DEV num bug da story; null se o dev nunca apontou
   * em nenhum bug dela. Não é uma fase do fluxo do Jira — é um período derivado dos apontamentos. */
  firstDevBugWorklogDate: string | null;
  /** Data (YYYY-MM-DD) do último apontamento do DEV num bug da story; null junto com
   * `firstDevBugWorklogDate`. */
  lastDevBugWorklogDate: string | null;
  /** Data (YYYY-MM-DD) do primeiro apontamento do TESTER num bug da story; null se o tester nunca
   * apontou em nenhum bug dela. Independente de `firstDevBugWorklogDate` — não é uma fase do fluxo
   * do Jira, é um período derivado dos apontamentos. */
  firstTesterBugWorklogDate: string | null;
  /** Data (YYYY-MM-DD) do último apontamento do TESTER num bug da story; null junto com
   * `firstTesterBugWorklogDate`. */
  lastTesterBugWorklogDate: string | null;
  isDone: boolean;
  doneTransitionDate: string | null;
  storyUpdated: string;
  today: string;
}): StatusHistorySegment[] {
  const {
    storyCreated,
    sprintEnteredAt,
    isCarried,
    emAndamentoEnteredAt,
    implStartDate,
    implCodeReviewEnteredAt,
    implDone,
    implDoneDate,
    firstTestWorklogDate,
    testDone,
    testDoneDate,
    firstDevBugWorklogDate,
    lastDevBugWorklogDate,
    firstTesterBugWorklogDate,
    lastTesterBugWorklogDate,
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

  // 1) Ainda não iniciada: começa na entrada da sprint ATUAL — exceto pra story herdada, que usa
  // `storyCreated` pra manter o tempo real de espera entre sprints (não reseta o relógio a cada
  // sprint que ela atravessa). Sem `sprintEnteredAt` (story criada já dentro da sprint, sem evento
  // de changelog), cai pra `storyCreated` também.
  const notStartedStart = isCarried ? dateOnly(storyCreated) : dateOnly(sprintEnteredAt ?? storyCreated);
  // Fim de "Ainda não iniciada" / início de "Em andamento": prioriza a transição literal de status
  // da própria story pra "Em andamento" (changelog); sem isso, cai pro início da Implementação
  // (`implStartDate`) como antes.
  const emAndamentoStart = emAndamentoEnteredAt ?? implStartDate;
  if (emAndamentoStart === null) {
    // Cobre tanto a story que nunca começou quanto a anomalia de dado "isDone mas sem nenhum dos
    // dois sinais" — nesse caso não há como saber quando as fases seguintes aconteceram, então
    // devolve só esse segmento em vez de inventar datas.
    pushSegment('Ainda não iniciada', notStartedStart, currentEnd);
    return segments;
  }
  pushSegment('Ainda não iniciada', notStartedStart, emAndamentoStart);

  // 2) Em andamento
  const implEnd = implCodeReviewEnteredAt ?? implDoneDate ?? currentEnd;
  pushSegment('Em andamento', emAndamentoStart, implEnd);

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

  // 5.5) Correção de bugs / Teste de bugs — não são fases do fluxo do Jira, são períodos derivados
  // dos apontamentos do dev/tester nos bugs da story (do primeiro ao último apontamento de cada
  // papel); cada uma só existe se o papel correspondente de fato apontou em algum bug dela, e são
  // independentes entre si. Diferente das outras fases, são sempre janelas já fechadas — refletem
  // apontamentos já lançados, não crescem até hoje como um status "em aberto".
  if (firstDevBugWorklogDate !== null) {
    pushSegment('Correção de bugs', firstDevBugWorklogDate, lastDevBugWorklogDate ?? firstDevBugWorklogDate);
  }
  if (firstTesterBugWorklogDate !== null) {
    pushSegment('Teste de bugs', firstTesterBugWorklogDate, lastTesterBugWorklogDate ?? firstTesterBugWorklogDate);
  }

  // 6) Aguardando liberação
  const awaitingReleaseStart = testDoneDate ?? currentEnd;
  pushSegment('Aguardando liberação', awaitingReleaseStart, currentEnd);
  if (!isDone) return segments;

  // 7) Concluída
  pushSegment('Concluída', currentEnd, today);

  return segments;
}
