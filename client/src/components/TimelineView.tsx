import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Activity, SprintInfo } from '../types.js';

const MIN_COLUMN_WIDTH = 28;
const MAX_COLUMN_WIDTH = 96;
const LABEL_COL_WIDTH = 460;
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
  sprintFilter,
  onChangeSprintFilter,
}: {
  activities: Activity[];
  sprints: SprintInfo[];
  today: string;
  sprintFilter: string;
  onChangeSprintFilter: (id: string) => void;
}) {
  const [expandedBugs, setExpandedBugs] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [dayWidth, setDayWidth] = useState(MIN_COLUMN_WIDTH);
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () => (sprintFilter === 'all' ? activities : activities.filter((a) => a.sprintId === sprintFilter)),
    [activities, sprintFilter],
  );

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

  const realTimelineWidth = Math.max(1, days.length) * dayWidth;
  const monthStartX = currentMonthDays[0] ? currentMonthDays[0].index * dayWidth : 0;
  const timelineWidth = Math.max(realTimelineWidth, monthStartX + RIGHT_SCROLL_BUFFER);

  const grouped = useMemo(() => groupByDeveloper(filtered), [filtered]);

  function toggleIn(setter: typeof setExpandedBugs, key: string) {
    setter((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function x(dateISO: string): number {
    const exact = dayIndexByDate.get(dateISO);
    if (exact !== undefined) return exact * dayWidth;
    // Cai num fim de semana/feriado (ex.: "hoje"): avança até o próximo dia útil visível.
    let cursor = dateISO;
    for (let i = 0; i < 14; i++) {
      cursor = addDays(cursor, 1);
      const idx = dayIndexByDate.get(cursor);
      if (idx !== undefined) return idx * dayWidth;
    }
    return dateISO < minDate ? 0 : (days.length - 1) * dayWidth;
  }

  const todayX = x(today);

  // Ao carregar/mudar o período (ou recalcular a largura das colunas), começa no início do mês
  // atual em vez do dia mais antigo (que pode ser uma tarefa herdada de meses atrás) — quem
  // quiser ver antes rola para a esquerda.
  useEffect(() => {
    const start = currentMonthDays[0] ? currentMonthDays[0].index * dayWidth : todayX;
    scrollRef.current?.scrollTo({ left: Math.max(0, start) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minDate, maxDate, dayWidth]);

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

  const hoverDate = hover ? days[Math.floor(hover.x / dayWidth)]?.date ?? null : null;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <FilterPill label="Todas as sprints" active={sprintFilter === 'all'} onClick={() => onChangeSprintFilter('all')} />
        {sprints.map((s) => (
          <FilterPill key={s.id} label={s.name} active={sprintFilter === s.id} onClick={() => onChangeSprintFilter(s.id)} />
        ))}
      </div>

      <Legend />

      <div ref={scrollRef} style={{ border: '1px solid var(--gridline)', borderRadius: 10, background: 'var(--surface-1)', overflowX: 'auto' }}>
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
                left: LABEL_COL_WIDTH + currentMonthDays[0].index * dayWidth,
                width: (currentMonthDays[currentMonthDays.length - 1].index - currentMonthDays[0].index + 1) * dayWidth,
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
            <div style={{ position: 'relative', height: 34, borderBottom: '1px solid var(--gridline)' }}>
              {days.map((day) => (
                <div
                  key={day.date}
                  style={{
                    position: 'absolute',
                    left: day.index * dayWidth,
                    width: dayWidth,
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
                  todayX={todayX}
                  bugsExpanded={expandedBugs.has(activity.key)}
                  onToggleBugs={() => toggleIn(setExpandedBugs, activity.key)}
                />
              ))}
            </div>
          ))}

          {days
            .filter((d) => d.isMonthStart)
            .map((day) => (
              <div
                key={day.date}
                style={{
                  position: 'absolute',
                  top: 34,
                  bottom: 0,
                  left: LABEL_COL_WIDTH + day.index * dayWidth,
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

          {hoverDate && hover && (
            <>
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: LABEL_COL_WIDTH + Math.floor(hover.x / dayWidth) * dayWidth + dayWidth / 2,
                  width: 0,
                  borderLeft: '1.5px dashed var(--text-muted)',
                  pointerEvents: 'none',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: Math.max(2, hover.y - 22),
                  left: LABEL_COL_WIDTH + Math.floor(hover.x / dayWidth) * dayWidth + dayWidth / 2,
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
      </div>
    </div>
  );
}

function ActivityRow({
  activity,
  x,
  todayX,
  bugsExpanded,
  onToggleBugs,
}: {
  activity: Activity;
  x: (d: string) => number;
  todayX: number;
  bugsExpanded: boolean;
  onToggleBugs: () => void;
}) {
  const bugCount = activity.bugs.length;

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
            <a href={activity.url} target="_blank" rel="noreferrer" style={{ fontWeight: 600, color: 'var(--text-primary)', textDecoration: 'none' }}>
              {activity.title}
            </a>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 3, fontSize: 10.5, color: 'var(--text-secondary)' }}>
              <StatusBadge activity={activity} />
              {activity.isCarried && <Tag color="var(--status-warning)">🕓 Herdada</Tag>}
              {!activity.isDone && (
                <span>
                  <span style={{ color: 'var(--text-muted)' }}>Início: </span>
                  {formatShort(activity.startDate)}
                </span>
              )}
              {activity.isDone && activity.deliveredDate ? (
                <span>
                  <span style={{ color: 'var(--text-muted)' }}>Entregue em: </span>
                  {formatShort(activity.deliveredDate)}
                </span>
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
        {activity.implWindow && activity.testWindow ? (
          <>
            <Bar
              left={x(activity.implWindow.start)}
              right={x(activity.implWindow.end)}
              color={activity.isDone ? 'var(--status-good)' : 'var(--series-impl)'}
              title={`Implementação: ${formatShort(activity.implWindow.start)} a ${formatShort(activity.implWindow.end)}`}
            />
            <Bar
              left={x(activity.testWindow.start)}
              right={x(activity.testWindow.end)}
              color={activity.isDone ? 'var(--status-good)' : 'var(--series-test)'}
              title={`Teste: ${formatShort(activity.testWindow.start)} a ${formatShort(activity.testWindow.end)}`}
            />
            {activity.isOverdue && activity.dueDate && (
              <Bar
                left={x(activity.dueDate)}
                right={todayX}
                color="var(--status-critical)"
                title={`Atrasada desde ${formatShort(activity.dueDate)}`}
              />
            )}
          </>
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
  if (activity.isOverdue) return <Tag color="var(--status-critical)">⚠️ Atrasada - {activity.status}</Tag>;
  return <span>{activity.status}</span>;
}

function Tag({ children, color }: { children: React.ReactNode; color: string }) {
  return <span style={{ color, fontWeight: 700, fontSize: 10 }}>{children}</span>;
}

export function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
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

function SideList({ activity }: { activity: Activity }) {
  const items: [string, string][] = [
    ['PF', activity.storyPoints !== null ? String(activity.storyPoints) : '—'],
    ['Dev', firstName(activity.developer)],
    ['Tester', activity.tester ? firstName(activity.tester) : '—'],
  ];
  return (
    <dl style={{ width: 130, flexShrink: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10.5, color: 'var(--text-secondary)' }}>
      {items.map(([label, value]) => (
        <div key={label} style={{ display: 'flex', gap: 4, overflow: 'hidden' }}>
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
    dates.push(a.startDate);
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
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}
