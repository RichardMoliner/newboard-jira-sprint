import { useMemo } from 'react';
import type { Activity, SprintInfo } from '../types.js';
import {
  computeKpis,
  computePersonSummaries,
  computeSprintSummaries,
  topActivitiesByBugCount,
} from '../indicators/computeIndicators.js';
import { FilterPill } from './TimelineView.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export default function IndicatorsView({
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
  const filtered = useMemo(
    () => (sprintFilter === 'all' ? activities : activities.filter((a) => a.sprintId === sprintFilter)),
    [activities, sprintFilter],
  );

  const kpis = useMemo(() => computeKpis(filtered, today), [filtered, today]);
  const people = useMemo(() => computePersonSummaries(filtered), [filtered]);
  const sprintSummaries = useMemo(() => computeSprintSummaries(filtered), [filtered]);
  const topBuggy = useMemo(() => topActivitiesByBugCount(filtered, 10), [filtered]);

  const atRisk = filtered.filter((a) => a.isOverdue);
  const carried = filtered.filter((a) => a.isCarried);

  const maxBugs = Math.max(1, ...people.map((p) => p.bugs));
  const maxStoryPoints = Math.max(1, ...people.map((p) => p.storyPoints));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <FilterPill label="Todas as sprints" active={sprintFilter === 'all'} onClick={() => onChangeSprintFilter('all')} />
        {sprints.map((s) => (
          <FilterPill key={s.id} label={s.name} active={sprintFilter === s.id} onClick={() => onChangeSprintFilter(s.id)} />
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <Kpi label="Atividades" value={kpis.totalActivities} />
        <Kpi label="Story points totais" value={kpis.totalStoryPoints} />
        <Kpi label="Concluídas" value={kpis.doneCount} suffix={`/${kpis.totalActivities}`} accent="var(--status-good)" />
        <Kpi label="Em risco" value={kpis.atRiskCount} suffix={`/${kpis.totalActivities}`} accent="var(--status-critical)" />
        <Kpi label="Herdadas" value={kpis.carriedCount} suffix={`/${kpis.totalActivities}`} accent="var(--status-warning)" />
        <Kpi label="Em andamento (no prazo)" value={kpis.inProgressOnTimeCount} />
        <Kpi label="Bugs abertos" value={kpis.openBugsCount} />
        <Kpi label="Bugs por atividade" value={kpis.bugsPerActivity.toFixed(1)} />
        <Kpi label="Sem estimativa" value={kpis.noEstimateCount} suffix={`/${kpis.totalActivities}`} />
      </div>

      <Section title="⚠️ Atividades em risco (previsão vencida e não concluídas)">
        {atRisk.length === 0 ? (
          <Empty text="Nenhuma atividade em risco." />
        ) : (
          <Table
            columns={['Atividade', 'Sprint', 'Responsável', 'Previsão', 'SP']}
            rows={atRisk.map((a) => [
              a.title,
              a.sprintName,
              a.developer,
              <span style={{ color: 'var(--status-critical)', fontWeight: 700 }}>{formatShort(a.dueDate!)}</span>,
              a.storyPoints ?? '—',
            ])}
          />
        )}
      </Section>

      <Section title="🕓 Tarefas herdadas de sprints anteriores">
        {carried.length === 0 ? (
          <Empty text="Nenhuma tarefa herdada." />
        ) : (
          <Table
            columns={['Atividade', 'Sprint', 'Responsável', 'Início original', 'SP', 'Dias carregando']}
            rows={carried.map((a) => [
              a.title,
              a.sprintName,
              a.developer,
              formatShort(a.startDate),
              a.storyPoints ?? '—',
              <span style={{ color: 'var(--status-warning)', fontWeight: 700 }}>{diffDays(a.startDate, today)} dias</span>,
            ])}
          />
        )}
      </Section>

      <Section title="Bugs por profissional">
        <BarList items={people.filter((p) => p.bugs > 0).map((p) => ({ label: p.person, value: p.bugs }))} max={maxBugs} color="var(--seq-orange-450)" />
      </Section>

      <Section title="Story points em execução por profissional">
        <BarList items={people.map((p) => ({ label: p.person, value: p.storyPoints }))} max={maxStoryPoints} color="var(--seq-blue-450)" format={(v) => v.toFixed(1)} />
      </Section>

      <Section title="Indicadores por profissional">
        <Table
          columns={['Pessoa', 'Ativ.', 'SP', 'Bugs', 'Concluídas', 'Em risco', 'Em andamento', 'Sem estimativa']}
          rows={people.map((p) => [
            p.person,
            p.activities,
            p.storyPoints.toFixed(1),
            p.bugs,
            p.done,
            <span style={p.atRisk > 0 ? { color: 'var(--status-critical)', fontWeight: 700 } : undefined}>{p.atRisk}</span>,
            p.inProgress,
            p.noEstimate,
          ])}
        />
      </Section>

      <Section title="Indicadores por sprint">
        <Table
          columns={['Sprint', 'Atividades', 'SP total', 'Bugs', 'Concluídas', 'Em risco']}
          rows={sprintSummaries.map((s) => [
            s.sprintName,
            s.activities,
            s.totalStoryPoints.toFixed(1),
            s.bugs,
            s.done,
            <span style={s.atRisk > 0 ? { color: 'var(--status-critical)' } : undefined}>{s.atRisk}</span>,
          ])}
        />
      </Section>

      <Section title="Atividades com mais bugs (top 10)">
        {topBuggy.length === 0 ? (
          <Empty text="Nenhum bug registrado." />
        ) : (
          <Table
            columns={['Atividade', 'Sprint', 'Responsável', 'Bugs']}
            rows={topBuggy.map((a) => [
              a.title,
              a.sprintName,
              a.developer,
              <span style={{ fontWeight: 700, color: 'var(--status-critical)' }}>{a.bugCount}</span>,
            ])}
          />
        )}
      </Section>
    </div>
  );
}

function Kpi({ label, value, suffix, accent }: { label: string; value: number | string; suffix?: string; accent?: string }) {
  return (
    <div style={{ background: 'var(--surface-1)', border: '1px solid var(--gridline)', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 6 }}>
        {label}
      </div>
      <div className="tabular-nums" style={{ fontSize: 22, fontWeight: 700, color: accent ?? 'var(--text-primary)' }}>
        {value}
        {suffix && <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 2 }}>{suffix}</span>}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 10px' }}>{title}</h3>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>{text}</p>;
}

function Table({ columns, rows }: { columns: string[]; rows: React.ReactNode[][] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} style={{ background: 'var(--page-plane)', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.3, textAlign: 'left', padding: '7px 10px', borderBottom: '1px solid var(--gridline)' }}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} style={{ padding: '6px 10px', borderBottom: '1px solid var(--gridline)' }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BarList({
  items,
  max,
  color,
  format = (v: number) => String(v),
}: {
  items: { label: string; value: number }[];
  max: number;
  color: string;
  format?: (v: number) => string;
}) {
  if (items.length === 0) return <Empty text="Sem dados." />;
  return (
    <div>
      {items.map((item) => (
        <div key={item.label} style={{ display: 'grid', gridTemplateColumns: '190px 1fr 46px', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 11.5 }}>
          <div style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</div>
          <div style={{ background: 'var(--page-plane)', borderRadius: 4, height: 14, position: 'relative' }}>
            <div style={{ width: `${(item.value / max) * 100}%`, height: '100%', borderRadius: 4, background: color }} />
          </div>
          <div className="tabular-nums" style={{ textAlign: 'right', fontWeight: 700 }}>
            {format(item.value)}
          </div>
        </div>
      ))}
    </div>
  );
}

function diffDays(fromISO: string, toISO: string): number {
  return Math.round((new Date(toISO).getTime() - new Date(fromISO).getTime()) / MS_PER_DAY);
}

function formatShort(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}
