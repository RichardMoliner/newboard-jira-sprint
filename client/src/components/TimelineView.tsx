import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Activity, SprintInfo } from '../types.js';

const MIN_COLUMN_WIDTH = 28;
const MAX_COLUMN_WIDTH = 96;
const LABEL_COL_WIDTH = 460;
// Espaço em branco reservado após o último dia real, para garantir que dê para rolar até o
// início do mês atual mesmo quando ele estiver perto do fim do período (poucos dias futuros).
const RIGHT_SCROLL_BUFFER = 3200;

// Visualização analítica (por hora): janela fixa de expediente exibida, 08h-18h.
const START_HOUR = 8;
const HOURS_WINDOW = 10;
const HOUR_COLUMN_WIDTH = 16;
// Deve espelhar IMPL_SHARE em server/src/compute/timeline.ts.
const IMPL_SHARE = 0.7;

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

function nextBusinessDay(dateISO: string): string {
  let cursor = addDays(dateISO, 1);
  while (!isBusinessDay(cursor)) cursor = addDays(cursor, 1);
  return cursor;
}

interface HourPoint {
  date: string;
  hour: number;
}

/**
 * Avança `hours` horas produtivas a partir de um ponto (data, hora), respeitando o expediente
 * (08h + `productiveHoursPerDay`) e pulando fins de semana/feriados — usado só na visualização
 * analítica, para posicionar as barras com precisão de hora a partir dos PFs.
 */
function addProductiveHours(point: HourPoint, hours: number, productiveHoursPerDay: number): HourPoint {
  let date = point.date;
  let hour = point.hour;
  while (!isBusinessDay(date)) {
    date = addDays(date, 1);
    hour = START_HOUR;
  }
  let remaining = hours;
  while (remaining > 1e-9) {
    const capacity = START_HOUR + productiveHoursPerDay - hour;
    if (capacity <= 0) {
      date = nextBusinessDay(date);
      hour = START_HOUR;
      continue;
    }
    const consume = Math.min(capacity, remaining);
    hour += consume;
    remaining -= consume;
  }
  return { date, hour };
}

interface AnalyticalWindows {
  implStart: HourPoint;
  implEnd: HourPoint;
  testEnd: HourPoint;
}

/** Projeta impl/teste com precisão de hora a partir dos PFs, sem o arredondamento em dias inteiros da visão padrão. */
function computeAnalyticalWindows(activity: Activity, hoursPerPf: number, hoursPerDay: number): AnalyticalWindows | null {
  if (activity.storyPoints === null) return null;
  const productiveHoursPerDay = Math.min(hoursPerDay, HOURS_WINDOW);
  let startDate = activity.startDate;
  while (!isBusinessDay(startDate)) startDate = addDays(startDate, 1);
  const implStart: HourPoint = { date: startDate, hour: START_HOUR };
  const totalHours = activity.storyPoints * hoursPerPf;
  const implHours = totalHours * IMPL_SHARE;
  const testHours = totalHours - implHours;
  const implEnd = addProductiveHours(implStart, implHours, productiveHoursPerDay);
  const testEnd = addProductiveHours(implEnd, testHours, productiveHoursPerDay);
  return { implStart, implEnd, testEnd };
}

export default function TimelineView({
  activities,
  sprints,
  today,
  hoursPerPf,
  hoursPerDay,
  sprintFilter,
  onSprintClick,
}: {
  activities: Activity[];
  sprints: SprintInfo[];
  today: string;
  hoursPerPf: number;
  hoursPerDay: number;
  sprintFilter: string[];
  onSprintClick: (id: string, shiftKey: boolean) => void;
}) {
  const [expandedBugs, setExpandedBugs] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [dayWidth, setDayWidth] = useState(MIN_COLUMN_WIDTH);
  const [searchQuery, setSearchQuery] = useState('');
  const [analyticalView, setAnalyticalView] = useState(false);
  const [hideDone, setHideDone] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const bySprint = sprintFilter.length === 0 ? activities : activities.filter((a) => sprintFilter.includes(a.sprintId));
    const byDone = hideDone ? bySprint.filter((a) => !a.isDone) : bySprint;
    const query = searchQuery.trim().toLowerCase();
    if (!query) return byDone;
    return byDone.filter((a) => a.title.toLowerCase().includes(query) || a.developer.toLowerCase().includes(query));
  }, [activities, sprintFilter, hideDone, searchQuery]);

  const { minDate, maxDate } = useMemo(() => computeDomain(activities, sprints, today), [activities, sprints, today]);
  const days = useMemo(() => buildDayList(minDate, maxDate, today), [minDate, maxDate, today]);
  const dayIndexByDate = useMemo(() => new Map(days.map((d) => [d.date, d.index])), [days]);
  const currentMonthDays = useMemo(() => days.filter((d) => d.isCurrentMonth), [days]);

  // Calcula a largura das colunas para que o mês atual (duração da sprint) preencha bem a tela
  // disponível, em vez de ficar com colunas estreitas de tamanho fixo em telas largas. Só se
  // aplica à visão padrão — a analítica usa uma largura de coluna fixa por hora.
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

  const dayPixelWidth = analyticalView ? HOUR_COLUMN_WIDTH * HOURS_WINDOW : dayWidth;
  const realTimelineWidth = Math.max(1, days.length) * dayPixelWidth;
  const monthStartX = currentMonthDays[0] ? currentMonthDays[0].index * dayPixelWidth : 0;
  const timelineWidth = Math.max(realTimelineWidth, monthStartX + RIGHT_SCROLL_BUFFER);

  const grouped = useMemo(() => groupByDeveloper(filtered), [filtered]);

  function toggleIn(setter: typeof setExpandedBugs, key: string) {
    setter((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  /** Posiciona uma data (início do expediente daquele dia) na régua — dia inteiro na visão padrão, primeira hora na analítica. */
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

  /** Só usada na visão analítica: posição com precisão de hora dentro do dia. */
  function xHour(dateISO: string, hour: number): number {
    return x(dateISO) + (hour - START_HOUR) * HOUR_COLUMN_WIDTH;
  }

  // Na visão analítica, a linha de "hoje" acompanha (aproximadamente) a hora atual do
  // computador dentro do expediente exibido; na visão padrão, marca só o dia.
  const nowHour = new Date().getHours() + new Date().getMinutes() / 60;
  const todayX = analyticalView ? xHour(today, Math.min(Math.max(nowHour, START_HOUR), START_HOUR + HOURS_WINDOW)) : x(today);

  const hasResults = filtered.length > 0;

  // Ao carregar/mudar o período (ou recalcular a largura das colunas, ou trocar de visão),
  // começa no início do mês atual em vez do dia mais antigo (que pode ser uma tarefa herdada de
  // meses atrás) — quem quiser ver antes rola para a esquerda. Na visão analítica, começa em hoje
  // em vez do mês, já que a régua por hora fica muito mais estreita e é o dia atual que interessa.
  // Também reaplica quando a busca deixa de estar vazia: sem isso, o navegador zera o scrollLeft
  // sozinho enquanto o empty state (bem mais estreito) está visível, e a posição nunca volta
  // quando os resultados reaparecem.
  useEffect(() => {
    if (!hasResults) return;
    const start = analyticalView
      ? x(today)
      : currentMonthDays[0]
        ? currentMonthDays[0].index * dayPixelWidth
        : todayX;
    scrollRef.current?.scrollTo({ left: Math.max(0, start) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minDate, maxDate, dayPixelWidth, hasResults, analyticalView]);

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
  const hoverHour = analyticalView && hover ? START_HOUR + Math.floor((hover.x % dayPixelWidth) / HOUR_COLUMN_WIDTH) : null;
  // Largura da régua de destaque: a coluna do dia inteiro na visão padrão, ou só a coluna da hora
  // na visão analítica — sempre a mesma largura usada para desenhar aquela coluna na régua.
  const hoverColumnWidth = analyticalView && hoverHour !== null ? HOUR_COLUMN_WIDTH : dayPixelWidth;
  const hoverColumnLeft =
    hoverDate !== null ? (analyticalView && hoverHour !== null ? xHour(hoverDate, hoverHour) : x(hoverDate)) : null;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
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
          <SwitchPill
            active={analyticalView}
            onClick={() => setAnalyticalView((v) => !v)}
            label="Visão analítica (por hora)"
            title="Mostra a linha do tempo em horas (08h-18h), com as barras posicionadas a partir dos Pontos de Função, sem arredondar para dias inteiros."
          />
          <SwitchPill active={hideDone} onClick={() => setHideDone((v) => !v)} label="Ocultar concluídas" />
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

      <p style={{ fontSize: 10.5, color: 'var(--text-muted)', margin: '0 0 14px' }}>
        Segure <strong>Shift</strong> e clique para combinar várias sprints no filtro.
      </p>

      <Legend />

      <div ref={scrollRef} style={{ border: '1px solid var(--gridline)', borderRadius: 10, background: 'var(--surface-1)', overflowX: 'auto' }}>
        {filtered.length === 0 ? (
          <EmptyState searchQuery={searchQuery} onClearSearch={() => setSearchQuery('')} />
        ) : (
        <div
          style={{ position: 'relative', width: LABEL_COL_WIDTH + timelineWidth }}
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

          <div style={{ display: 'grid', gridTemplateColumns: `${LABEL_COL_WIDTH}px ${timelineWidth}px` }}>
            <div
              style={{
                position: 'sticky',
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
            <div style={{ position: 'relative', height: analyticalView ? 46 : 34, borderBottom: '1px solid var(--gridline)' }}>
              {analyticalView
                ? days.map((day) => (
                    <div
                      key={day.date}
                      style={{
                        position: 'absolute',
                        left: day.index * dayPixelWidth,
                        width: dayPixelWidth,
                        top: 0,
                        bottom: 0,
                        borderLeft: '1px solid var(--baseline)',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 9.5,
                          fontWeight: day.date === today || day.isCurrentMonth ? 700 : 400,
                          color: day.date === today ? 'var(--status-critical)' : day.isCurrentMonth ? 'var(--text-primary)' : 'var(--text-secondary)',
                          textAlign: 'center',
                          paddingTop: 3,
                        }}
                      >
                        {day.dayOfMonth}/{day.monthLabel}
                      </div>
                      <div style={{ display: 'flex' }}>
                        {Array.from({ length: HOURS_WINDOW }, (_, i) => START_HOUR + i).map((hour) => (
                          <div
                            key={hour}
                            style={{
                              width: HOUR_COLUMN_WIDTH,
                              textAlign: 'center',
                              fontSize: 7,
                              paddingTop: 2,
                              overflow: 'hidden',
                              color: 'var(--text-muted)',
                            }}
                          >
                            {hour}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                : days.map((day) => (
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

          {grouped.map(([developer, items]) => (
            <div key={developer} style={{ display: 'grid', gridTemplateColumns: `${LABEL_COL_WIDTH}px ${timelineWidth}px` }}>
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
                }}
              >
                {developer}
              </div>
              <div style={{ background: 'color-mix(in srgb, var(--series-impl) 12%, var(--surface-1))', borderBottom: '1px solid var(--gridline)' }} />
              {items.map((activity) => (
                <ActivityRow
                  key={activity.key}
                  activity={activity}
                  x={x}
                  xHour={xHour}
                  todayX={todayX}
                  analyticalView={analyticalView}
                  hoursPerPf={hoursPerPf}
                  hoursPerDay={hoursPerDay}
                  bugsExpanded={expandedBugs.has(activity.key)}
                  onToggleBugs={() => toggleIn(setExpandedBugs, activity.key)}
                />
              ))}
            </div>
          ))}

          {!analyticalView &&
            days
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
            title={analyticalView ? `Agora (${formatShort(today)} ${Math.round(nowHour)}h, aprox.)` : `Hoje (${formatShort(today)})`}
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
                {analyticalView && hoverHour !== null ? ` ${hoverHour}h` : ''}
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
  xHour,
  todayX,
  analyticalView,
  hoursPerPf,
  hoursPerDay,
  bugsExpanded,
  onToggleBugs,
}: {
  activity: Activity;
  x: (d: string) => number;
  xHour: (d: string, hour: number) => number;
  todayX: number;
  analyticalView: boolean;
  hoursPerPf: number;
  hoursPerDay: number;
  bugsExpanded: boolean;
  onToggleBugs: () => void;
}) {
  const bugCount = activity.bugs.length;
  const analytical = analyticalView ? computeAnalyticalWindows(activity, hoursPerPf, hoursPerDay) : null;

  const implLeft = analytical ? xHour(analytical.implStart.date, analytical.implStart.hour) : activity.implWindow && x(activity.implWindow.start);
  const implRight = analytical ? xHour(analytical.implEnd.date, analytical.implEnd.hour) : activity.implWindow && x(activity.implWindow.end);
  const testLeft = analytical ? xHour(analytical.implEnd.date, analytical.implEnd.hour) : activity.testWindow && x(activity.testWindow.start);
  // Concluída: a barra vai até a entrega real, não até o fim da janela de teste projetada — para
  // tarefas herdadas que ficaram muito tempo paradas, a previsão original pode estar bem no
  // passado em relação à data em que a tarefa foi de fato entregue.
  const testRight =
    activity.isDone && activity.deliveredDate
      ? x(activity.deliveredDate)
      : analytical
        ? xHour(analytical.testEnd.date, analytical.testEnd.hour)
        : activity.testWindow && x(activity.testWindow.end);
  const overdueLeft = analytical ? xHour(analytical.testEnd.date, analytical.testEnd.hour) : activity.dueDate !== null ? x(activity.dueDate) : null;

  return (
    <>
      <div
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
              {activity.title}
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
              {activity.isDone && activity.deliveredDate ? (
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
      <div style={{ position: 'relative', height: 34, borderBottom: '1px solid var(--gridline)' }}>
        {implLeft !== null && implLeft !== undefined && implRight !== null && implRight !== undefined && testLeft !== null && testLeft !== undefined && testRight !== null && testRight !== undefined ? (
          <>
            <Bar
              left={implLeft}
              right={implRight}
              color={activity.isDone ? 'var(--status-good)' : 'var(--series-impl)'}
              title={
                analytical
                  ? `Implementação: ${formatShort(analytical.implStart.date)} ${analytical.implStart.hour}h a ${formatShort(analytical.implEnd.date)} ${Math.round(analytical.implEnd.hour * 10) / 10}h`
                  : `Implementação: ${formatShort(activity.implWindow!.start)} a ${formatShort(activity.implWindow!.end)}`
              }
            />
            <Bar
              left={testLeft}
              right={testRight}
              color={activity.isDone ? 'var(--status-good)' : 'var(--series-test)'}
              title={
                activity.isDone && activity.deliveredDate
                  ? `Teste: ${formatShort(activity.testWindow!.start)} a ${formatShort(activity.deliveredDate)} (entregue)`
                  : analytical
                    ? `Teste: ${formatShort(analytical.implEnd.date)} ${Math.round(analytical.implEnd.hour * 10) / 10}h a ${formatShort(analytical.testEnd.date)} ${Math.round(analytical.testEnd.hour * 10) / 10}h`
                    : `Teste: ${formatShort(activity.testWindow!.start)} a ${formatShort(activity.testWindow!.end)}`
              }
            />
            {activity.isOverdue && overdueLeft !== null && overdueLeft !== undefined && (
              <Bar left={overdueLeft} right={todayX} color="var(--status-critical)" title={`Atrasada desde ${formatShort(activity.dueDate!)}`} />
            )}
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

      {bugsExpanded &&
        [...activity.bugs]
          .sort((a, b) => Number(isResolvedBug(b.status)) - Number(isResolvedBug(a.status)))
          .map((bug) => <BugRow key={bug.key} bug={bug} x={x} />)}
    </>
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
      <div style={{ position: 'sticky', left: 0, zIndex: 1, background: 'var(--page-plane)', padding: '5px 14px 5px 34px', borderBottom: '1px solid var(--gridline)', borderRight: '1px solid var(--gridline)', fontSize: 10.5, color: isResolved ? 'var(--status-good)' : 'var(--text-secondary)' }}>
        <div>
          <span style={{ color: textColor, fontWeight: 700, marginRight: 4 }}>{bug.key}</span>
          {bug.title}
        </div>
        <div style={{ color: textColor, marginTop: 2 }}>
          {bug.developer ?? '—'} - {bug.status}
          {isResolved && ` em ${formatShort(bug.endDate)}`}
        </div>
      </div>
      <div style={{ position: 'relative', height: 24, borderBottom: '1px solid var(--gridline)', background: 'var(--page-plane)' }}>
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

function StatusBadge({ activity }: { activity: Activity }) {
  if (activity.isDone) return <Tag color="var(--status-good)">✅ Concluída</Tag>;
  if (activity.notStarted) return <Tag color="var(--text-muted)">◌ Ainda não iniciada</Tag>;
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

const HOURS_PAIR_TITLE = 'Apontado (worklog da subtarefa) / Previsto (a partir do PF e das horas por PF configuradas).';

/** Verde se a Implementação (já atendida) levou menos horas que o previsto; vermelho se levou mais; null se não dá pra comparar. */
function implCheckColor(activity: Activity): string | null {
  if (!activity.implDone || activity.implLoggedHours === null || activity.implEstimatedHours === null) return null;
  return activity.implLoggedHours <= activity.implEstimatedHours ? 'var(--status-good)' : 'var(--status-critical)';
}

function SideList({ activity }: { activity: Activity }) {
  const assertividadeTitle =
    activity.assertividadePercent !== null
      ? 'Horas apontadas (Implementação + Teste) dividido pelas horas estimadas (PF × horas/PF). 100% = estimativa bateu exatamente com o apontado; abaixo de 100% superestimamos, acima subestimamos.'
      : undefined;
  const checkColor = implCheckColor(activity);
  const items: [string, React.ReactNode, string?][] = [
    ['PF', activity.storyPoints !== null ? String(activity.storyPoints) : '—'],
    ['Dev', firstName(activity.developer)],
    ['Tester', activity.tester ? firstName(activity.tester) : '—'],
    [
      'Impl. (h)',
      <>
        {formatHoursPair(activity.implLoggedHours, activity.implEstimatedHours)}
        {checkColor && (
          <span style={{ color: checkColor, marginLeft: 4, fontWeight: 700 }} title="Implementação atendida">
            ✓
          </span>
        )}
      </>,
      HOURS_PAIR_TITLE,
    ],
    ['Teste (h)', formatHoursPair(activity.testLoggedHours, activity.testEstimatedHours), HOURS_PAIR_TITLE],
    ['Assert.', activity.assertividadePercent !== null ? `${Math.round(activity.assertividadePercent)}%` : '—', assertividadeTitle],
  ];
  return (
    <dl style={{ width: 150, flexShrink: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10.5, color: 'var(--text-secondary)' }}>
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

function formatShort(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
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
