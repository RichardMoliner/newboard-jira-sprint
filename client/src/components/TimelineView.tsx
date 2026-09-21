import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Activity, SprintInfo, TimelineWindow, WorklogEntry } from '../types.js';

const MIN_COLUMN_WIDTH = 28;
const MAX_COLUMN_WIDTH = 96;
const LABEL_COL_WIDTH = 500;
// Implementação e Teste ficam em faixas separadas dentro da linha da atividade, para dar pra ver
// apontamentos em paralelo (ex.: bug corrigido enquanto o teste já está rolando) sem uma barra
// tampar a outra.
const PHASE_BAND_HEIGHT = 22;
const PHASE_BAND_GAP = 2;
const BARS_ROW_HEIGHT = PHASE_BAND_HEIGHT * 2 + PHASE_BAND_GAP;
const IMPL_BAND_TOP = 0;
const TEST_BAND_TOP = PHASE_BAND_HEIGHT + PHASE_BAND_GAP;
// Espaço em branco reservado após o último dia real, para garantir que dê para rolar até o
// início do mês atual mesmo quando ele estiver perto do fim do período (poucos dias futuros).
const RIGHT_SCROLL_BUFFER = 3200;

const MONTH_ABBREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Domingo de Páscoa (algoritmo de Gauss), usado para feriados móveis. */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

/** Feriados nacionais (fixos + móveis a partir da Páscoa) para um ano. */
function nationalHolidays(year: number): Set<string> {
  const easter = easterSunday(year);
  const movable = [
    addDays(toISODate(easter), -48), // Carnaval (segunda)
    addDays(toISODate(easter), -47), // Carnaval (terça)
    addDays(toISODate(easter), -2), // Sexta-feira Santa
    addDays(toISODate(easter), 60), // Corpus Christi
  ];

  const fixed = [
    `${year}-01-01`,
    `${year}-04-21`,
    `${year}-05-01`,
    `${year}-09-07`,
    `${year}-10-12`,
    `${year}-11-02`,
    `${year}-11-15`,
    `${year}-11-20`,
    `${year}-12-25`,
  ];

  return new Set([...fixed, ...movable]);
}

const holidayCache = new Map<number, Set<string>>();

function isHoliday(dateISO: string): boolean {
  const year = Number(dateISO.slice(0, 4));
  let holidays = holidayCache.get(year);
  if (!holidays) {
    holidays = nationalHolidays(year);
    holidayCache.set(year, holidays);
  }
  return holidays.has(dateISO);
}

function isBusinessDay(dateISO: string): boolean {
  const weekday = new Date(`${dateISO}T00:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return !isHoliday(dateISO);
}

export default function TimelineView({
  activities,
  sprints,
  today,
  hoursPerDay,
  sprintFilter,
  onSprintClick,
}: {
  activities: Activity[];
  sprints: SprintInfo[];
  today: string;
  hoursPerDay: number;
  sprintFilter: string[];
  onSprintClick: (id: string, shiftKey: boolean) => void;
}) {
  const [expandedBugs, setExpandedBugs] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [dayWidth, setDayWidth] = useState(MIN_COLUMN_WIDTH);
  const [searchQuery, setSearchQuery] = useState('');
  const [hideDone, setHideDone] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const bySprint = sprintFilter.length === 0 ? activities : activities.filter((a) => sprintFilter.includes(a.sprintId));
    const byDone = hideDone ? bySprint.filter((a) => !a.isDone && !a.testDone) : bySprint;
    const query = searchQuery.trim().toLowerCase();
    if (!query) return byDone;
    return byDone.filter(
      (a) => a.title.toLowerCase().includes(query) || a.key.toLowerCase().includes(query) || a.developer.toLowerCase().includes(query),
    );
  }, [activities, sprintFilter, hideDone, searchQuery]);

  const { minDate, maxDate } = useMemo(() => computeDomain(activities, sprints, today), [activities, sprints, today]);
  const days = useMemo(() => buildDayList(minDate, maxDate, today), [minDate, maxDate, today]);
  const dayIndexByDate = useMemo(() => new Map(days.map((d) => [d.date, d.index])), [days]);
  const currentMonthDays = useMemo(() => days.filter((d) => d.isCurrentMonth), [days]);

  // Calcula a largura das colunas para que o mês atual (duração da sprint) preencha bem a tela
  // disponível, em vez de ficar com colunas estreitas de tamanho fixo em telas largas.
  useLayoutEffect(() => {
    function recompute() {
      const el = scrollRef.current;
      if (!el || currentMonthDays.length === 0) return;
      const available = el.clientWidth - LABEL_COL_WIDTH;
      const ideal = Math.floor(available / currentMonthDays.length);
      setDayWidth(Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, ideal)));
    }
    recompute();
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
  }, [currentMonthDays.length]);

  const dayPixelWidth = dayWidth;
  const realTimelineWidth = Math.max(1, days.length) * dayPixelWidth;
  const monthStartX = currentMonthDays[0] ? currentMonthDays[0].index * dayPixelWidth : 0;
  const timelineWidth = Math.max(realTimelineWidth, monthStartX + RIGHT_SCROLL_BUFFER);

  const grouped = useMemo(() => groupByDeveloper(filtered), [filtered]);
  // Disponibilidade é uma propriedade da PESSOA, não do filtro de sprint/busca ativo no momento —
  // usa todas as atividades (todas as sprints), senão um dev alocado numa tarefa de outra sprint
  // aparece como "disponível" só porque essa tarefa está fora do filtro atual.
  const byDeveloperAcrossAllSprints = useMemo(() => new Map(groupByDeveloper(activities)), [activities]);
  const devsWorkingOnBugs = useMemo(() => {
    const set = new Set<string>();
    for (const a of activities) {
      for (const bug of a.bugs) {
        if (bug.developer && !isResolvedBug(bug.status)) set.add(bug.developer);
      }
    }
    return set;
  }, [activities]);
  const availableDevs = useMemo(
    () =>
      [...byDeveloperAcrossAllSprints.entries()]
        .filter(([developer, items]) => isDeveloperAvailable(items) && !devsWorkingOnBugs.has(developer))
        .map(([developer]) => developer)
        .sort((a, b) => a.localeCompare(b)),
    [byDeveloperAcrossAllSprints, devsWorkingOnBugs],
  );

  function toggleIn(setter: typeof setExpandedBugs, key: string) {
    setter((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  /** Posiciona uma data na régua (início do dia). */
  function x(dateISO: string): number {
    const exact = dayIndexByDate.get(dateISO);
    if (exact !== undefined) return exact * dayPixelWidth;
    // Cai num fim de semana/feriado (ex.: "hoje"): avança até o próximo dia útil visível.
    let cursor = dateISO;
    for (let i = 0; i < 14; i++) {
      cursor = addDays(cursor, 1);
      const idx = dayIndexByDate.get(cursor);
      if (idx !== undefined) return idx * dayPixelWidth;
    }
    return dateISO < minDate ? 0 : (days.length - 1) * dayPixelWidth;
  }

  const todayX = x(today);

  const hasResults = filtered.length > 0;

  // Ao carregar/mudar o período (ou recalcular a largura das colunas), começa no início do mês
  // atual em vez do dia mais antigo (que pode ser uma tarefa herdada de meses atrás) — quem quiser
  // ver antes rola para a esquerda. Também reaplica quando a busca deixa de estar vazia: sem isso,
  // o navegador zera o scrollLeft sozinho enquanto o empty state (bem mais estreito) está visível,
  // e a posição nunca volta quando os resultados reaparecem.
  useEffect(() => {
    if (!hasResults) return;
    const start = currentMonthDays[0] ? currentMonthDays[0].index * dayPixelWidth : todayX;
    scrollRef.current?.scrollTo({ left: Math.max(0, start) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minDate, maxDate, dayPixelWidth, hasResults]);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const container = scrollRef.current;
    if (!container) return;
    // Usa o retângulo do container com scroll (não o do conteúdo interno, que fica cada vez
    // mais deslocado para a esquerda conforme rola) para saber se o mouse está sobre a coluna
    // fixa de atividade/bugs (sticky) ou de fato sobre as colunas de dia.
    const containerRect = container.getBoundingClientRect();
    const viewportX = e.clientX - containerRect.left;
    if (viewportX < LABEL_COL_WIDTH) {
      setHover(null);
      return;
    }
    const localX = viewportX - LABEL_COL_WIDTH + container.scrollLeft;
    if (localX < 0 || localX > timelineWidth) {
      setHover(null);
      return;
    }
    setHover({ x: localX, y: e.clientY - containerRect.top });
  }

  const hoverDayIndex = hover ? Math.floor(hover.x / dayPixelWidth) : null;
  const hoverDate = hoverDayIndex !== null ? days[hoverDayIndex]?.date ?? null : null;
  // Largura da régua de destaque: a coluna do dia inteiro — mesma largura usada para desenhar
  // aquela coluna na régua.
  const hoverColumnWidth = dayPixelWidth;
  const hoverColumnLeft = hoverDate !== null ? x(hoverDate) : null;

  return (
    // Um único painel contínuo (sem gap entre as partes) do topo até o fim da tela: filtros +
    // legenda ficam fixos aqui em cima, encostados na régua de dias — só a tabela por baixo rola,
    // aproveitando o máximo de altura possível.
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        border: '1px solid var(--gridline)',
        borderRadius: 10,
        background: 'var(--surface-1)',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '12px 14px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <FilterPill label="Todas as sprints" active={sprintFilter.length === 0} onClick={() => onSprintClick('all', false)} />
          {sprints.map((s) => (
            <FilterPill
              key={s.id}
              label={s.name}
              active={sprintFilter.includes(s.id)}
              onClick={(e) => onSprintClick(s.id, e.shiftKey)}
            />
          ))}
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginLeft: 'auto' }}>
            <SwitchPill active={hideDone} onClick={() => setHideDone((v) => !v)} label="Ocultar concluídas/Ag. liberação" />
            <div style={{ position: 'relative' }}>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por tarefa ou responsável..."
                style={{
                  padding: `6px ${searchQuery ? 28 : 12}px 6px 12px`,
                  fontSize: 11.5,
                  borderRadius: 20,
                  border: '1px solid var(--baseline)',
                  background: 'var(--surface-1)',
                  color: 'var(--text-primary)',
                  fontFamily: 'inherit',
                  minWidth: 220,
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  aria-label="Limpar busca"
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    fontSize: 15,
                    lineHeight: 1,
                    padding: 2,
                  }}
                >
                  ×
                </button>
              )}
            </div>
          </div>
        </div>

        <p style={{ fontSize: 10.5, color: 'var(--text-muted)', margin: '6px 0 0' }}>
          Segure <strong>Shift</strong> e clique para combinar várias sprints no filtro.
        </p>
      </div>

      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--gridline)', flexShrink: 0 }}>
        <Legend />
        {availableDevs.length > 0 && (
          <p style={{ margin: '8px 0 0', fontSize: 10.5, color: 'var(--text-secondary)' }}>
            <span style={{ marginRight: 4 }}>⚠️</span>
            <strong>Devs disponíveis:</strong> {availableDevs.join(', ')}
          </p>
        )}
      </div>

      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {filtered.length === 0 ? (
          <EmptyState searchQuery={searchQuery} onClearSearch={() => setSearchQuery('')} />
        ) : (
        <div
          style={{
            position: 'relative',
            display: 'grid',
            gridTemplateColumns: `${LABEL_COL_WIDTH}px ${timelineWidth}px`,
            width: LABEL_COL_WIDTH + timelineWidth,
          }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHover(null)}
        >
          {currentMonthDays.length > 0 && (
            <div
              title="Mês atual"
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: LABEL_COL_WIDTH + currentMonthDays[0].index * dayPixelWidth,
                width: (currentMonthDays[currentMonthDays.length - 1].index - currentMonthDays[0].index + 1) * dayPixelWidth,
                background: 'color-mix(in srgb, var(--series-impl) 7%, transparent)',
                pointerEvents: 'none',
              }}
            />
          )}

          {/* `display: contents` — expõe as duas células diretamente como itens do grid unificado
              acima (linha inteira da timeline), em vez de criar um mini-grid isolado só pra elas.
              Isso é o que dá "espaço" pro cabeçalho ficar sticky por toda a rolagem: um grid do
              tamanho de uma linha só (34px) não tem onde o sticky "flutuar" ao rolar milhares de
              pixels de conteúdo abaixo dele. */}
          <div style={{ display: 'contents' }}>
            <div
              style={{
                position: 'sticky',
                top: 0,
                left: 0,
                zIndex: 3,
                background: 'var(--surface-1)',
                padding: '8px 14px',
                fontSize: 10.5,
                fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: 0.3,
                borderBottom: '1px solid var(--gridline)',
                borderRight: '1px solid var(--gridline)',
              }}
            >
              Atividade
            </div>
            <div style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--surface-1)', height: 34, borderBottom: '1px solid var(--gridline)' }}>
              {days.map((day) => (
                <div
                  key={day.date}
                  style={{
                    position: 'absolute',
                    left: day.index * dayPixelWidth,
                    width: dayPixelWidth,
                    top: 0,
                    bottom: 0,
                    borderLeft: day.isMonthStart ? '1px solid var(--baseline)' : undefined,
                    textAlign: 'center',
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: day.date === today || day.isCurrentMonth ? 700 : 400,
                      color: day.date === today ? 'var(--status-critical)' : day.isCurrentMonth ? 'var(--text-primary)' : 'var(--text-secondary)',
                      paddingTop: 4,
                    }}
                  >
                    {day.dayOfMonth}
                  </div>
                  {day.isMonthStart && (
                    <div
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color: day.isCurrentMonth ? 'var(--series-impl)' : 'var(--text-muted)',
                        textTransform: 'uppercase',
                      }}
                    >
                      {day.monthLabel}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {grouped.map(([developer, items]) => {
            const available = isDeveloperAvailable(byDeveloperAcrossAllSprints.get(developer) ?? []);
            const workingOnBugs = available && devsWorkingOnBugs.has(developer);
            return (
            <div key={developer} style={{ display: 'contents' }}>
              <div
                style={{
                  position: 'sticky',
                  left: 0,
                  zIndex: 2,
                  background: 'color-mix(in srgb, var(--series-impl) 12%, var(--surface-1))',
                  color: 'var(--series-impl)',
                  fontWeight: 700,
                  fontSize: 11,
                  padding: '5px 14px',
                  borderBottom: '1px solid var(--gridline)',
                  borderRight: '1px solid var(--gridline)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                {developer}
                {available && (
                  <Tag color={workingOnBugs ? 'var(--series-bug)' : 'var(--status-good)'}>
                    {workingOnBugs
                      ? '✓ Atuando em bugs'
                      : '✓ Disponível'}
                  </Tag>
                )}
              </div>
              <div style={{ background: 'color-mix(in srgb, var(--series-impl) 12%, var(--surface-1))', borderBottom: '1px solid var(--gridline)' }} />
              {items.map((activity) => (
                <ActivityRow
                  key={activity.key}
                  activity={activity}
                  x={x}
                  todayX={todayX}
                  today={today}
                  dayPixelWidth={dayPixelWidth}
                  hoursPerDay={hoursPerDay}
                  bugsExpanded={expandedBugs.has(activity.key)}
                  onToggleBugs={() => toggleIn(setExpandedBugs, activity.key)}
                />
              ))}
            </div>
            );
          })}

          {days
            .filter((d) => d.isMonthStart)
            .map((day) => (
                <div
                  key={day.date}
                  style={{
                    position: 'absolute',
                    top: 34,
                    bottom: 0,
                    left: LABEL_COL_WIDTH + day.index * dayPixelWidth,
                    width: 1,
                    background: 'var(--baseline)',
                    pointerEvents: 'none',
                  }}
                />
              ))}

          <div
            title={`Hoje (${formatShort(today)})`}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: LABEL_COL_WIDTH + todayX,
              width: 2,
              background: 'var(--status-critical)',
              pointerEvents: 'none',
            }}
          />

          {hoverDate && hover && hoverColumnLeft !== null && (
            <>
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: LABEL_COL_WIDTH + hoverColumnLeft,
                  width: hoverColumnWidth,
                  background: 'color-mix(in srgb, var(--text-muted) 14%, transparent)',
                  pointerEvents: 'none',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: Math.max(2, hover.y - 22),
                  left: LABEL_COL_WIDTH + hoverColumnLeft + hoverColumnWidth / 2,
                  transform: 'translateX(-50%)',
                  background: 'var(--text-primary)',
                  color: 'var(--surface-1)',
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: 4,
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  zIndex: 4,
                }}
              >
                {formatShort(hoverDate)}
              </div>
            </>
          )}
        </div>
        )}
      </div>
    </div>
  );
}

function ActivityRow({
  activity,
  x,
  todayX,
  today,
  dayPixelWidth,
  hoursPerDay,
  bugsExpanded,
  onToggleBugs,
}: {
  activity: Activity;
  x: (d: string) => number;
  todayX: number;
  today: string;
  dayPixelWidth: number;
  hoursPerDay: number;
  bugsExpanded: boolean;
  onToggleBugs: () => void;
}) {
  const bugCount = activity.bugs.length;

  // Caixa tracejada = janela ESTIMADA (fixa, nunca muda) — a "expectativa".
  const implBoxLeft = activity.implWindow && x(activity.implWindow.start);
  const implBoxRight = activity.implWindow && x(activity.implWindow.end);

  // Uma vez que a PRÓPRIA fase está concluída, o dia a dia com gaps deixa de ser útil pra ela —
  // mostra só um bloco sólido único com o total apontado. Isso é por fase: a Implementação pode
  // fechar bem antes do Teste (ou vice-versa), e não faz sentido continuar marcando "gap" nos dias
  // de espera de uma fase que o próprio dev/tester já entregou.
  const implPhaseDone = activity.implDone || activity.isDone;
  const testPhaseDone = activity.testDone || activity.isDone;
  const { implHoursByDate, testHoursByDate } = computeDailyHours(activity);

  // Início real do teste = data do primeiro apontamento de horas na subtarefa de Teste — a data de
  // criação da subtarefa (ou de conclusão da Implementação) não indica que o teste começou de fato.
  const firstTestWorklogDate = activity.worklogEntries.find((e) => e.subtaskType === 'Teste')?.date ?? null;
  const testHasLoggedHours = firstTestWorklogDate !== null || (activity.testLoggedHours ?? 0) > 0;
  const testHasRealProgress = testHasLoggedHours || activity.testDone;

  const projectedTestWindow = projectTestWindow({ testWindow: activity.testWindow, testHasRealProgress, implPhaseDone, today });
  const projectedTestStart = projectedTestWindow?.start ?? null;
  const projectedTestEnd = projectedTestWindow?.end ?? null;
  const testWindowIsProjected =
    activity.testWindow !== null && projectedTestStart !== null && projectedTestStart !== activity.testWindow.start;
  const testBoxLeft = projectedTestStart ? x(projectedTestStart) : null;
  const testBoxRight = projectedTestEnd ? x(projectedTestEnd) : null;
  const hasBothWindows =
    implBoxLeft !== null && implBoxLeft !== undefined && implBoxRight !== null && implBoxRight !== undefined &&
    testBoxLeft !== null && testBoxLeft !== undefined && testBoxRight !== null && testBoxRight !== undefined;

  // Preenchimento = progresso REAL ("realizado"), dia a dia conforme os apontamentos — dá pra ver
  // exatamente em quais dias o dev/tester trabalhou e onde ficaram os gaps (dias úteis sem
  // apontamento). Cresce do início real até hoje (ou até a entrega), passando da caixa quando
  // atrasa — nesse caso a caixa marca onde deveria ter terminado.
  const lastImplWorklogDate = lastWorklogDate(activity.worklogEntries, 'Implementação');
  const implFillEndDate = computeImplFillEndDate({
    implWindow: activity.implWindow,
    implPhaseDone,
    lastImplWorklogDate,
    firstTestWorklogDate,
    isDone: activity.isDone,
    deliveredDate: activity.deliveredDate,
    today,
  });
  // Bloco sólido (fase concluída): o último dia real de trabalho pode ter sido parcial (ex.: 4h de
  // uma jornada de 6h30) — sem esse acréscimo proporcional, esse dia simplesmente desaparecia da
  // barra (o traço vai até o INÍCIO do dia, não o fim).
  const implFillRight = implFillEndDate
    ? x(implFillEndDate) + (implPhaseDone ? dayFillRatio(implHoursByDate.get(implFillEndDate) ?? 0, hoursPerDay) * dayPixelWidth : 0)
    : null;

  const testFillRange = computeTestFillRange({
    testWindow: activity.testWindow,
    firstTestWorklogDate,
    testHasLoggedHours,
    testPhaseDone,
    isDone: activity.isDone,
    testDone: activity.testDone,
    deliveredDate: activity.deliveredDate,
    today,
  });
  const testFillStartDate = testFillRange?.start ?? null;
  const testFillEndDate = testFillRange?.end ?? null;
  const testFillRight = testFillEndDate
    ? x(testFillEndDate) + (testPhaseDone ? dayFillRatio(testHoursByDate.get(testFillEndDate) ?? 0, hoursPerDay) * dayPixelWidth : 0)
    : null;
  // Atrasada: cada fase ainda em aberto mostra sua própria barra vermelha, preenchendo dia a dia
  // pelos apontamentos do mesmo jeito que quando está em dia — em vez de uma faixa vermelha única
  // por cima de tudo. Uma fase já concluída fica verde mesmo que a tarefa como um todo esteja
  // atrasada por causa da outra fase.
  const implFillColor = implPhaseDone ? 'var(--status-good)' : activity.isOverdue ? 'var(--status-critical)' : 'var(--series-impl)';
  const testFillColor = testPhaseDone ? 'var(--status-good)' : activity.isOverdue ? 'var(--status-critical)' : 'var(--series-test)';
  const implFillCells =
    !activity.implWindow || implFillRight === null
      ? []
      : implPhaseDone
        ? renderSimpleFill(
            implBoxLeft!,
            implFillRight,
            implFillColor,
            activity.implLoggedHours !== null
              ? `Implementação (realizado): ${formatHoursMinutes(activity.implLoggedHours)} apontadas${activity.implEstimatedHours !== null ? ` de ${formatHoursMinutes(activity.implEstimatedHours)} previstas` : ''}`
              : `Em andamento desde ${formatShort(activity.implWindow.start)}`,
            IMPL_BAND_TOP + 6,
          )
        : buildDailyFillCells({
            startDate: activity.implWindow.start,
            endDate: implFillEndDate!,
            hoursByDate: implHoursByDate,
            hoursPerDay,
            x,
            dayPixelWidth,
            color: implFillColor,
            top: IMPL_BAND_TOP + 6,
          });
  const testFillCells = !testHasRealProgress || !testFillStartDate || testFillRight === null
    ? []
    : testPhaseDone
      ? renderSimpleFill(
          x(testFillStartDate),
          testFillRight,
          testFillColor,
          activity.testLoggedHours !== null
            ? `Teste (realizado): ${formatHoursMinutes(activity.testLoggedHours)} apontadas${activity.testEstimatedHours !== null ? ` de ${formatHoursMinutes(activity.testEstimatedHours)} previstas` : ''}`
            : `Em andamento desde ${formatShort(testFillStartDate)}`,
          TEST_BAND_TOP + 6,
        )
      : buildDailyFillCells({
          startDate: testFillStartDate,
          endDate: testFillEndDate!,
          hoursByDate: testHoursByDate,
          hoursPerDay,
          x,
          dayPixelWidth,
          color: testFillColor,
          top: TEST_BAND_TOP + 6,
        });

  return (
    <div className="timeline-row" style={{ display: 'contents' }}>
      <div
        className="timeline-row-info"
        style={{
          position: 'sticky',
          left: 0,
          zIndex: 1,
          background: 'var(--surface-1)',
          padding: '7px 14px',
          borderBottom: '1px solid var(--gridline)',
          borderRight: '1px solid var(--gridline)',
          fontSize: 11.5,
        }}
      >
        <div style={{ display: 'flex', gap: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <a
              href={activity.url}
              target="_blank"
              rel="noreferrer"
              title={worklogTooltip(activity.worklogEntries)}
              style={{ fontWeight: 600, color: 'var(--text-primary)', textDecoration: 'none' }}
            >
              {activity.key} - {activity.title}
            </a>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 3, fontSize: 10.5, color: 'var(--text-secondary)' }}>
              <StatusBadge activity={activity} />
              {activity.isCarried && <Tag color="var(--status-warning)">🕓 Herdada</Tag>}
              {!activity.notStarted && (
                <span>
                  <span style={{ color: 'var(--text-muted)' }}>Início: </span>
                  {formatShort(activity.startDate)}
                </span>
              )}
              {firstTestWorklogDate && (
                <span>
                  <span style={{ color: 'var(--text-muted)' }}>Início do teste: </span>
                  {formatShort(firstTestWorklogDate)}
                </span>
              )}
              {(activity.isDone || activity.testDone) && activity.deliveredDate ? (
                <>
                  {activity.dueDate && (
                    <span>
                      <span style={{ color: 'var(--text-muted)' }}>Previsão: </span>
                      {formatShort(activity.dueDate)}
                    </span>
                  )}
                  <span>
                    <span style={{ color: 'var(--text-muted)' }}>Entregue em: </span>
                    {formatShort(activity.deliveredDate)}
                  </span>
                  {activity.deliveredOnTime !== null && (
                    <Tag color={activity.deliveredOnTime ? 'var(--status-good)' : 'var(--status-critical)'}>
                      {activity.deliveredOnTime ? '✓ No prazo' : '✗ Fora do prazo'}
                    </Tag>
                  )}
                </>
              ) : activity.isOverdue && activity.dueDate ? (
                <span>
                  <span style={{ color: 'var(--text-muted)' }}>Atrasada desde: </span>
                  {formatShort(activity.dueDate)}
                </span>
              ) : (
                activity.dueDate && (
                  <span>
                    <span style={{ color: 'var(--text-muted)' }}>Previsão de entrega: </span>
                    {formatShort(activity.dueDate)}
                  </span>
                )
              )}
            </div>
            {bugCount > 0 && (
              <button onClick={onToggleBugs} style={{ ...toggleButtonStyle, marginTop: 4 }}>
                {bugCount} bug{bugCount > 1 ? 's' : ''} <span style={{ display: 'inline-block', transform: bugsExpanded ? 'rotate(90deg)' : 'none' }}>▸</span>
              </button>
            )}
          </div>
          <SideList activity={activity} />
        </div>
      </div>
      <div
        className="timeline-row-bars"
        style={{ display: 'flex', alignItems: 'center', minHeight: hasBothWindows ? BARS_ROW_HEIGHT : 34, borderBottom: '1px solid var(--gridline)' }}
      >
        {/* Altura fixa igual à das barras + `align-items: center` no pai: quando a linha fica mais
            alta que as barras (puxada pela coluna de info, que tem mais texto), esse bloco fica
            centralizado em vez de grudado no topo com um vão vazio embaixo. */}
        <div style={{ position: 'relative', width: '100%', height: hasBothWindows ? BARS_ROW_HEIGHT : 34 }}>
          {hasBothWindows ? (
            <>
              <PhaseBar
                boxLeft={implBoxLeft!}
                boxRight={implBoxRight!}
                fillRight={implFillRight!}
                boxColor="var(--series-impl)"
                boxTitle={`Implementação (previsto): ${formatShort(activity.implWindow!.start)} a ${formatShort(activity.implWindow!.end)}`}
                markerTitle={`Previsão era terminar a Implementação até ${formatShort(activity.implWindow!.end)}`}
                fillCells={implFillCells}
                bandTop={IMPL_BAND_TOP}
              />
              <PhaseBar
                boxLeft={testBoxLeft!}
                boxRight={testBoxRight!}
                fillRight={testFillRight!}
                boxColor="var(--series-test)"
                boxTitle={
                  testWindowIsProjected
                    ? `Teste (projeção, ainda não iniciado): ${formatShort(projectedTestStart!)} a ${formatShort(projectedTestEnd!)}`
                    : `Teste (previsto): ${formatShort(projectedTestStart!)} a ${formatShort(projectedTestEnd!)}`
                }
                bandTop={TEST_BAND_TOP}
                markerTitle={`Previsão era terminar o Teste até ${formatShort(projectedTestEnd!)}`}
                fillCells={testFillCells}
              />
            </>
          ) : activity.notStarted ? (
            <span style={{ position: 'absolute', left: 4, top: 10, fontSize: 10, color: 'var(--text-muted)' }}>
              ainda não iniciada
            </span>
          ) : (
            <span style={{ position: 'absolute', left: x(activity.startDate) + 4, top: 10, fontSize: 10, color: 'var(--text-muted)' }}>
              sem estimativa
            </span>
          )}
        </div>
      </div>

      {bugsExpanded &&
        [...activity.bugs]
          .sort((a, b) => Number(isResolvedBug(b.status)) - Number(isResolvedBug(a.status)))
          .map((bug) => <BugRow key={bug.key} bug={bug} x={x} />)}
    </div>
  );
}

function normalizeStatus(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function isResolvedBug(status: string): boolean {
  return normalizeStatus(status) === 'atendida';
}

function BugRow({ bug, x }: { bug: Activity['bugs'][number]; x: (d: string) => number }) {
  const isResolved = isResolvedBug(bug.status);
  const textColor = isResolved ? 'var(--status-good)' : 'var(--text-muted)';
  return (
    <>
      <div className="timeline-row-info" style={{ position: 'sticky', left: 0, zIndex: 1, background: 'var(--page-plane)', padding: '5px 14px 5px 34px', borderBottom: '1px solid var(--gridline)', borderRight: '1px solid var(--gridline)', fontSize: 10.5, color: isResolved ? 'var(--status-good)' : 'var(--text-secondary)' }}>
        <div>
          <span style={{ color: textColor, fontWeight: 700, marginRight: 4 }}>{bug.key}</span>
          {bug.title}
        </div>
        <div style={{ color: textColor, marginTop: 2 }}>
          {bug.developer ?? '—'} - {bug.status}
          {isResolved && ` em ${formatShort(bug.endDate)}`}
        </div>
      </div>
      <div className="timeline-row-bars" style={{ position: 'relative', height: 24, borderBottom: '1px solid var(--gridline)', background: 'var(--page-plane)' }}>
        <Bar left={x(bug.startDate)} right={x(bug.endDate)} color={isResolved ? 'var(--status-good)' : 'var(--series-bug)'} height={8} top={8} title={`${bug.key}: ${formatShort(bug.startDate)} a ${formatShort(bug.endDate)}`} />
      </div>
    </>
  );
}

function Bar({
  left,
  right,
  color,
  title,
  height = 16,
  top,
  minWidth = 6,
}: {
  left: number;
  right: number;
  color: string;
  title: string;
  height?: number;
  top?: number;
  minWidth?: number;
}) {
  const width = Math.max(right - left, minWidth);
  return (
    <div
      title={title}
      style={{
        position: 'absolute',
        left,
        width,
        top: top ?? (34 - height) / 2,
        height,
        background: color,
        borderRadius: 4,
      }}
    />
  );
}

/**
 * Caixa tracejada = janela estimada (fixa); preenchimento = progresso real, dia a dia conforme os
 * apontamentos (ver buildDailyFillCells), que cresce a partir do mesmo início e pode passar da
 * caixa quando atrasa — nesse caso aparece uma marca vertical no fim da caixa, indicando onde a
 * fase deveria ter terminado. `bandTop` posiciona a faixa (Implementação/Teste ficam em faixas
 * separadas dentro da linha, para não uma tampar a outra quando há apontamentos em paralelo).
 */
function PhaseBar({
  boxLeft,
  boxRight,
  fillRight,
  boxColor,
  boxTitle,
  markerTitle,
  fillCells,
  bandTop,
}: {
  boxLeft: number;
  boxRight: number;
  fillRight: number;
  boxColor: string;
  boxTitle: string;
  markerTitle: string;
  fillCells: React.ReactNode;
  bandTop: number;
}) {
  const boxWidth = Math.max(boxRight - boxLeft, 6);
  const overruns = fillRight > boxRight + 1;
  return (
    <>
      <div
        title={boxTitle}
        style={{
          position: 'absolute',
          left: boxLeft,
          width: boxWidth,
          top: bandTop + 3,
          height: 16,
          border: `1.5px dashed ${boxColor}`,
          borderRadius: 4,
          boxSizing: 'border-box',
          pointerEvents: overruns ? 'none' : undefined,
        }}
      />
      {fillCells}
      {overruns && (
        <div
          title={markerTitle}
          style={{
            position: 'absolute',
            left: boxRight - 1,
            top: bandTop + 1,
            width: 2,
            height: PHASE_BAND_HEIGHT - 2,
            background: 'var(--status-critical)',
          }}
        />
      )}
    </>
  );
}

function StatusBadge({ activity }: { activity: Activity }) {
  if (activity.isDone) return <Tag color="var(--status-good)">✅ Concluída</Tag>;
  if (activity.notStarted) return <Tag color="var(--text-muted)">◌ Ainda não iniciada</Tag>;
  if (activity.testDone) return <Tag color="var(--status-good)">📦 Aguardando liberação</Tag>;
  if (activity.isOverdue) return <Tag color="var(--status-critical)">⚠️ Atrasada - {activity.status}</Tag>;
  return <span>{activity.status}</span>;
}

function Tag({ children, color }: { children: React.ReactNode; color: string }) {
  return <span style={{ color, fontWeight: 700, fontSize: 10 }}>{children}</span>;
}

export function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 14px',
        fontSize: 11.5,
        fontWeight: 700,
        color: active ? '#fff' : 'var(--text-secondary)',
        background: active ? 'var(--series-impl)' : 'var(--surface-1)',
        border: `1px solid ${active ? 'var(--series-impl)' : 'var(--baseline)'}`,
        borderRadius: 20,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {label}
    </button>
  );
}

function SwitchPill({ active, onClick, label, title }: { active: boolean; onClick: () => void; label: string; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: 0,
        fontSize: 11.5,
        fontWeight: 700,
        color: active ? 'var(--series-impl)' : 'var(--text-secondary)',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      <span
        style={{
          position: 'relative',
          width: 28,
          height: 16,
          borderRadius: 10,
          background: active ? 'var(--series-impl)' : 'var(--baseline)',
          transition: 'background 0.15s',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: active ? 14 : 2,
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: '#fff',
            transition: 'left 0.15s',
          }}
        />
      </span>
      {label}
    </button>
  );
}

function EmptyState({ searchQuery, onClearSearch }: { searchQuery: string; onClearSearch: () => void }) {
  return (
    <div
      style={{
        padding: '48px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 32 }}>🔍</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
        {searchQuery ? `Nenhuma tarefa encontrada para "${searchQuery}"` : 'Nenhuma tarefa encontrada'}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        {searchQuery ? 'Tente outro termo ou troque o filtro de sprint.' : 'Troque o filtro de sprint para ver outras atividades.'}
      </div>
      {searchQuery && (
        <button onClick={onClearSearch} style={{ ...toggleButtonStyle, marginTop: 6 }}>
          Limpar busca
        </button>
      )}
    </div>
  );
}

function Legend() {
  const items: [string, string][] = [
    ['var(--series-impl)', 'Implementação'],
    ['var(--series-test)', 'Teste'],
    ['var(--status-good)', 'Concluída'],
    ['var(--status-critical)', 'Atraso'],
    ['var(--series-bug)', 'Bug'],
  ];
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--text-secondary)', marginBottom: 14 }}>
      {items.map(([color, label]) => (
        <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: color, display: 'inline-block' }} />
          {label}
        </span>
      ))}
    </div>
  );
}

// Nomes em que exibir apenas o primeiro nome gera ambiguidade com outra pessoa.
const LAST_NAME_OVERRIDES = new Set(['Rafael Pauli']);

function firstName(fullName: string): string {
  const parts = fullName.split(' ');
  if (LAST_NAME_OVERRIDES.has(fullName)) return parts[parts.length - 1];
  return parts[0];
}

/** Converte horas decimais para "Xh" ou "XhMM" — não existe "137,7h", só 137h42min. */
function formatHoursMinutes(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

/** "Apontado / Previsto" — '—' de cada lado quando não há dado (sem subtarefa ainda / sem estimativa). */
function formatHoursPair(logged: number | null, estimated: number | null): string {
  if (logged === null && estimated === null) return '—';
  return `${logged !== null ? formatHoursMinutes(logged) : '—'} / ${estimated !== null ? formatHoursMinutes(estimated) : '—'}`;
}

/** Lista todos os apontamentos (Implementação + Teste) da atividade, para o tooltip do nome da tarefa. */
function worklogTooltip(entries: Activity['worklogEntries']): string | undefined {
  if (entries.length === 0) return undefined;
  const lines = entries.map((e) => `[${e.subtaskType}] ${formatShort(e.date)} · ${e.author} · ${formatHoursMinutes(e.hours)}`);
  return `Apontamentos:\n${lines.join('\n')}`;
}

const HOURS_PAIR_TITLE =
  'Apontado (worklog da subtarefa) / Previsto (a partir do PF e das horas por PF configuradas). Entre parênteses, o % consumido (apontado sobre previsto) — atualiza dia a dia, não precisa a tarefa terminar.';

/** Verde se a fase (já atendida) levou menos horas que o previsto; vermelho se levou mais; null se não dá pra comparar. */
function hoursCheckColor(done: boolean, logged: number | null, estimated: number | null): string | null {
  if (!done || logged === null || estimated === null) return null;
  return logged <= estimated ? 'var(--status-good)' : 'var(--status-critical)';
}

/** % do previsto já consumido (apontado / previsto) — "vivo", disponível desde o primeiro apontamento, não só quando a fase termina. Null sem apontamento ou sem previsto pra comparar. */
export function formatConsumedPercent(logged: number | null, estimated: number | null): string | null {
  if (logged === null || estimated === null || estimated <= 0) return null;
  return `${Math.round((logged / estimated) * 100)}%`;
}

function HoursWithCheck({ logged, estimated, indicator }: { logged: number | null; estimated: number | null; indicator: React.ReactNode }) {
  const consumedPercent = formatConsumedPercent(logged, estimated);
  return (
    <>
      {formatHoursPair(logged, estimated)}
      {consumedPercent && (
        <span style={{ marginLeft: 4, color: 'var(--text-muted)', fontWeight: 400 }}>({consumedPercent})</span>
      )}
      {indicator}
    </>
  );
}

function checkIndicator(color: string | null, title: string): React.ReactNode {
  if (!color) return null;
  return (
    <span style={{ color, marginLeft: 4, fontWeight: 700 }} title={title}>
      ✓
    </span>
  );
}

function SideList({ activity }: { activity: Activity }) {
  const assertividadeTitle =
    activity.assertividadePercent !== null
      ? 'Horas apontadas (Implementação + Teste) dividido pelas horas estimadas (PF × horas/PF). 100% = estimativa bateu exatamente com o apontado; abaixo de 100% superestimamos, acima subestimamos.'
      : undefined;
  const assertividadeComBugsTitle =
    'Mesma % de Assertividade, somando também as horas apontadas em bugs — esforço real total, incluindo correções fora da estimativa original.';
  const implCheckColor = hoursCheckColor(activity.implDone, activity.implLoggedHours, activity.implEstimatedHours);
  const testCheckColor = hoursCheckColor(activity.testDone, activity.testLoggedHours, activity.testEstimatedHours);
  const items: [string, React.ReactNode, string?][] = [
    ['PF', activity.storyPoints !== null ? String(activity.storyPoints) : '—'],
    ['Dev', firstName(activity.developer)],
    ['Tester', activity.tester ? firstName(activity.tester) : '—'],
    [
      'Impl. (h)',
      <HoursWithCheck logged={activity.implLoggedHours} estimated={activity.implEstimatedHours} indicator={checkIndicator(implCheckColor, 'Implementação atendida')} />,
      HOURS_PAIR_TITLE,
    ],
    [
      'Teste (h)',
      <HoursWithCheck logged={activity.testLoggedHours} estimated={activity.testEstimatedHours} indicator={checkIndicator(testCheckColor, 'Teste atendido')} />,
      HOURS_PAIR_TITLE,
    ],
    ...(activity.bugsLoggedHours !== null
      ? ([
          [
            'Bugs (h)',
            formatHoursMinutes(activity.bugsLoggedHours),
            'Soma de todos os apontamentos (worklog) lançados nos bugs desta atividade, de qualquer pessoa.',
          ] as [string, React.ReactNode, string?],
        ])
      : []),
    ['Assert.', activity.assertividadePercent !== null ? `${Math.round(activity.assertividadePercent)}%` : '—', assertividadeTitle],
    ...(activity.bugs.length > 0
      ? ([
          [
            'Assert. c/ bugs',
            activity.assertividadeComBugsPercent !== null ? `${Math.round(activity.assertividadeComBugsPercent)}%` : '—',
            assertividadeComBugsTitle,
          ] as [string, React.ReactNode, string?],
        ])
      : []),
  ];
  return (
    <dl style={{ width: 190, flexShrink: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10.5, color: 'var(--text-secondary)' }}>
      {items.map(([label, value, title]) => (
        <div key={label} title={title} style={{ display: 'flex', gap: 4, overflow: 'hidden', cursor: title ? 'help' : undefined }}>
          <dt style={{ margin: 0, color: 'var(--text-muted)', flexShrink: 0 }}>{label}:</dt>
          <dd style={{ margin: 0, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const toggleButtonStyle: React.CSSProperties = {
  background: 'var(--page-plane)',
  color: 'var(--text-secondary)',
  fontWeight: 700,
  fontSize: 10,
  padding: '2px 8px',
  borderRadius: 20,
  border: '1px solid var(--baseline)',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** A própria data, se já for dia útil, senão o próximo dia útil — usada como "o mais cedo possível a partir de hoje". */
function ceilToBusinessDay(dateISO: string): string {
  let cursor = dateISO;
  while (!isBusinessDay(cursor)) cursor = addDays(cursor, 1);
  return cursor;
}

/** O próximo dia útil, estritamente depois da data informada (nunca a própria data). */
function nextBusinessDay(dateISO: string): string {
  return ceilToBusinessDay(addDays(dateISO, 1));
}

function addBusinessDays(dateISO: string, count: number): string {
  let cursor = dateISO;
  let added = 0;
  while (added < count) {
    cursor = addDays(cursor, 1);
    if (isBusinessDay(cursor)) added++;
  }
  return cursor;
}

function countBusinessDaysInclusive(startISO: string, endISO: string): number {
  let count = 0;
  let cursor = startISO;
  while (cursor <= endISO) {
    if (isBusinessDay(cursor)) count++;
    cursor = addDays(cursor, 1);
  }
  return count;
}

/**
 * Teste sem nenhum apontamento real ainda e a janela prevista já ficou no passado: reprojeta o
 * início pra frente, preservando a mesma duração em dias úteis — só para exibição, não mexe em
 * prazo/KPIs. O "mais cedo possível" depende de a Implementação já estar concluída: se estiver
 * (só falta o Teste começar), o Teste pode começar HOJE; se a Implementação ainda está aberta
 * (atrasada), o Teste só poderia começar a partir de AMANHÃ, já que hoje ainda é dia de
 * Implementação. Sempre pulando fim de semana/feriado.
 */
export function projectTestWindow({
  testWindow,
  testHasRealProgress,
  implPhaseDone,
  today,
}: {
  testWindow: TimelineWindow | null;
  testHasRealProgress: boolean;
  implPhaseDone: boolean;
  today: string;
}): TimelineWindow | null {
  if (!testWindow) return null;
  if (testHasRealProgress) return testWindow;
  const earliestStart = implPhaseDone ? ceilToBusinessDay(today) : nextBusinessDay(today);
  if (earliestStart <= testWindow.start) return testWindow;
  const durationDays = countBusinessDaysInclusive(testWindow.start, testWindow.end);
  return { start: earliestStart, end: addBusinessDays(earliestStart, durationDays - 1) };
}

/** Data do apontamento mais recente de um tipo de subtarefa (Implementação/Teste/Bug), ou null se não houver nenhum. */
export function lastWorklogDate(entries: WorklogEntry[], type: WorklogEntry['subtaskType']): string | null {
  let last: string | null = null;
  for (const entry of entries) {
    if (entry.subtaskType === type && (last === null || entry.date > last)) {
      last = entry.date;
    }
  }
  return last;
}

function formatShort(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

function maxDateStr(a: string, b: string): string {
  return a > b ? a : b;
}

/**
 * Fim do preenchimento da barra de Implementação: uma vez que a fase está concluída, para no
 * último apontamento real dela — não em "hoje", senão a barra continuaria crescendo mesmo depois
 * que o trabalho já acabou, só porque o Teste ainda não começou. Enquanto ainda está em andamento,
 * continua crescendo até hoje (ou até o início real do Teste / a entrega, o que vier primeiro).
 */
export function computeImplFillEndDate({
  implWindow,
  implPhaseDone,
  lastImplWorklogDate,
  firstTestWorklogDate,
  isDone,
  deliveredDate,
  today,
}: {
  implWindow: TimelineWindow | null;
  implPhaseDone: boolean;
  lastImplWorklogDate: string | null;
  firstTestWorklogDate: string | null;
  isDone: boolean;
  deliveredDate: string | null;
  today: string;
}): string | null {
  if (!implWindow) return null;
  const candidate = implPhaseDone
    ? (lastImplWorklogDate ?? implWindow.start)
    : (firstTestWorklogDate ?? (isDone && deliveredDate ? deliveredDate : today));
  return maxDateStr(candidate, implWindow.start);
}

/**
 * Faixa de preenchimento da barra de Teste. Quando a subtarefa de Teste é dada como "Atendida" sem
 * NENHUMA hora realmente apontada (ninguém logou tempo nela), não há como saber quando o trabalho
 * aconteceu de fato — em vez de desenhar um bloco enorme do início previsto (semanas atrás) até a
 * entrega, como se aquele período todo fosse teste, colapsa num único ponto na data de entrega (um
 * traço mínimo), do mesmo jeito que a Implementação já faz quando está concluída sem apontamento.
 */
export function computeTestFillRange({
  testWindow,
  firstTestWorklogDate,
  testHasLoggedHours,
  testPhaseDone,
  isDone,
  testDone,
  deliveredDate,
  today,
}: {
  testWindow: TimelineWindow | null;
  firstTestWorklogDate: string | null;
  testHasLoggedHours: boolean;
  testPhaseDone: boolean;
  isDone: boolean;
  testDone: boolean;
  deliveredDate: string | null;
  today: string;
}): TimelineWindow | null {
  const testHasRealProgress = testHasLoggedHours || testDone;
  if (!testHasRealProgress) {
    const start = testWindow?.start ?? null;
    return start ? { start, end: start } : null;
  }
  if (testHasLoggedHours) {
    const start = firstTestWorklogDate ?? testWindow?.start ?? null;
    if (!start) return null;
    const end = (isDone || testDone) && deliveredDate ? deliveredDate : today;
    return { start, end };
  }
  const anchor = deliveredDate ?? testWindow?.start ?? null;
  return anchor ? { start: anchor, end: anchor } : null;
}

/**
 * Soma os apontamentos por dia, separados em Implementação/Teste. Apontamentos em Bug ficam de
 * fora — contam à parte, no campo "Bugs (h)", não inflam mais o preenchimento das barras de
 * Implementação/Teste.
 */
export function computeDailyHours(activity: Activity): { implHoursByDate: Map<string, number>; testHoursByDate: Map<string, number> } {
  const implHoursByDate = new Map<string, number>();
  const testHoursByDate = new Map<string, number>();
  for (const entry of activity.worklogEntries) {
    if (entry.subtaskType !== 'Implementação' && entry.subtaskType !== 'Teste') continue;
    const bucket = entry.subtaskType === 'Implementação' ? implHoursByDate : testHoursByDate;
    bucket.set(entry.date, (bucket.get(entry.date) ?? 0) + entry.hours);
  }
  return { implHoursByDate, testHoursByDate };
}

/** Fração do dia (0 a 1) coberta pelas horas apontadas, dado o tamanho da jornada configurada. */
export function dayFillRatio(hours: number, hoursPerDay: number): number {
  return hoursPerDay > 0 ? Math.min(1, hours / hoursPerDay) : hours > 0 ? 1 : 0;
}

/** Bloco sólido único (sem quebra por dia) — usado quando o dia a dia deixou de ser relevante. */
function renderSimpleFill(left: number, right: number, color: string, title: string, top: number): React.ReactNode {
  const width = right - left;
  // Início e fim no mesmo dia (ex.: Implementação e Teste começaram no mesmo dia) ainda precisam
  // aparecer como um traço mínimo — só não desenha se a fase nem chegou a existir (largura negativa
  // não deveria acontecer, mas por segurança).
  if (width < 0) return null;
  return <div title={title} style={{ position: 'absolute', left, width: Math.max(width, 3), top, height: 10, background: color, borderRadius: 3 }} />;
}

/**
 * Monta o preenchimento da barra dia a dia (só dias úteis, incluindo hoje), como uma mini barra de
 * progresso por dia: cada dia vale 100% da jornada configurada (hoursPerDay), e a LARGURA
 * preenchida (não a opacidade) é proporcional ao apontado naquele dia — dia sem nenhum apontamento
 * fica só com o contorno tracejado (0% preenchido). O hover mostra a data e, quando o gap é menor
 * que 1 dia (apontamento parcial), quantas horas faltaram.
 */
function buildDailyFillCells({
  startDate,
  endDate,
  hoursByDate,
  hoursPerDay,
  x,
  dayPixelWidth,
  color,
  top,
}: {
  startDate: string;
  endDate: string;
  hoursByDate: Map<string, number>;
  hoursPerDay: number;
  x: (d: string) => number;
  dayPixelWidth: number;
  color: string;
  top: number;
}): React.ReactNode[] {
  const cells: React.ReactNode[] = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    if (isBusinessDay(cursor)) {
      const hours = hoursByDate.get(cursor) ?? 0;
      const isGap = hours <= 0;
      const ratio = dayFillRatio(hours, hoursPerDay);
      const isFull = ratio >= 1;
      const gapHours = Math.max(0, hoursPerDay - hours);
      const title = isGap
        ? `Sem apontamento em ${formatShort(cursor)}`
        : isFull
          ? `${formatHoursMinutes(hours)} apontadas em ${formatShort(cursor)}`
          : `${formatHoursMinutes(hours)} apontadas em ${formatShort(cursor)} (gap de ${formatHoursMinutes(gapHours)})`;
      const innerWidth = Math.max(0, dayPixelWidth - 2);
      cells.push(
        <div key={cursor} title={title} style={{ position: 'absolute', left: x(cursor), width: dayPixelWidth, top, height: 10 }}>
          {isFull ? (
            <div style={{ position: 'absolute', inset: 0, margin: '0 1px', borderRadius: 3, boxSizing: 'border-box', background: color }} />
          ) : (
            <>
              <div style={{ position: 'absolute', inset: 0, margin: '0 1px', borderRadius: 3, boxSizing: 'border-box', border: `1.5px dashed ${color}` }} />
              {ratio > 0 && (
                <div style={{ position: 'absolute', top: 1, bottom: 1, left: 1, width: ratio * innerWidth, borderRadius: 2, background: color }} />
              )}
            </>
          )}
        </div>,
      );
    }
    cursor = addDays(cursor, 1);
  }
  return cells;
}

interface DayInfo {
  date: string;
  index: number;
  dayOfMonth: string;
  isMonthStart: boolean;
  isCurrentMonth: boolean;
  monthLabel: string;
}

/** Lista apenas os dias úteis (sem fins de semana nem feriados) entre minDate e maxDate. */
function buildDayList(minDate: string, maxDate: string, todayISO: string): DayInfo[] {
  const days: DayInfo[] = [];
  const currentMonthKey = todayISO.slice(0, 7);
  let prevMonthKey: string | null = null;
  let index = 0;
  let cursor = minDate;
  while (cursor <= maxDate) {
    if (isBusinessDay(cursor)) {
      const [, month, dayOfMonth] = cursor.split('-');
      const monthKey = cursor.slice(0, 7);
      days.push({
        date: cursor,
        index,
        dayOfMonth,
        isMonthStart: monthKey !== prevMonthKey,
        isCurrentMonth: monthKey === currentMonthKey,
        monthLabel: MONTH_ABBREV[Number(month) - 1],
      });
      prevMonthKey = monthKey;
      index++;
    }
    cursor = addDays(cursor, 1);
  }
  return days;
}

/**
 * Domínio real: do início mais antigo (incluindo atividades herdadas) até a
 * previsão mais distante ou hoje. Como a escala agora é em pixels fixos por
 * dia (com rolagem horizontal), um período longo não esmaga as barras atuais
 * — o scroll inicial já foca em torno de hoje (ver useEffect no componente).
 */
function computeDomain(activities: Activity[], sprints: SprintInfo[], today: string): { minDate: string; maxDate: string } {
  const dates: string[] = [today, ...sprints.flatMap((s) => [s.startDate, s.endDate])];
  for (const a of activities) {
    // Sem subtarefa de Implementação ainda, `startDate` é só a data de criação da story — não é
    // um início real e não deve esticar o período exibido no eixo de dias.
    if (!a.notStarted) dates.push(a.startDate);
    if (a.testWindow) dates.push(a.testWindow.end);
    if (a.dueDate) dates.push(a.dueDate);
  }
  dates.sort();
  return { minDate: dates[0], maxDate: dates[dates.length - 1] };
}

function groupByDeveloper(activities: Activity[]): [string, Activity[]][] {
  const map = new Map<string, Activity[]>();
  for (const a of activities) {
    const list = map.get(a.developer) ?? [];
    list.push(a);
    map.set(a.developer, list);
  }
  // Concluídas primeiro, depois por data de início, e as ainda não iniciadas sempre por último
  // (não têm um início real para ordenar) — dentro de cada desenvolvedor.
  for (const list of map.values()) {
    list.sort(
      (a, b) =>
        Number(a.notStarted) - Number(b.notStarted) ||
        Number(b.isDone) - Number(a.isDone) ||
        a.startDate.localeCompare(b.startDate),
    );
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/** True quando o dev não tem mais nada por implementar entre as atividades listadas — Implementação atendida (ou a story inteira concluída) em todas. Não considera o Teste: esperar o teste não ocupa o dev. */
export function isDeveloperAvailable(activities: Activity[]): boolean {
  return activities.length > 0 && activities.every((a) => a.implDone || a.isDone);
}

/** True quando há algum bug ainda aberto (não "Atendida") atribuído a esse dev, em qualquer uma das atividades informadas — não só nas que estão "no nome dele". */
export function isWorkingOnBugs(developerName: string, activities: Activity[]): boolean {
  return activities.some((a) => a.bugs.some((bug) => bug.developer === developerName && !isResolvedBug(bug.status)));
}
