import { useMemo, useState } from 'react';
import type { Activity, SprintInfo } from '../types.js';
import {
  computeHoursPerPfByDeveloper,
  computeKpis,
  computePersonSummaries,
  computeSprintSummaries,
  computeStatusSummaries,
  computeRealizedProductivity,
  topActivitiesByBugCount,
} from '../indicators/computeIndicators.js';
import { FilterPill } from './TimelineView.js';
import StatusPieChart from './StatusPieChart.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export default function IndicatorsView({
  activities,
  sprints,
  today,
  sprintFilter,
  onSprintClick,
  hoursPerPf,
  assumedTestSharePercent,
}: {
  activities: Activity[];
  sprints: SprintInfo[];
  today: string;
  sprintFilter: string[];
  onSprintClick: (id: string, shiftKey: boolean) => void;
  hoursPerPf: number;
  assumedTestSharePercent: number;
}) {
  const filtered = useMemo(
    () => (sprintFilter.length === 0 ? activities : activities.filter((a) => sprintFilter.includes(a.sprintId))),
    [activities, sprintFilter],
  );

  const kpis = useMemo(() => computeKpis(filtered, today), [filtered, today]);

  const [considerCarriedInProductivity, setConsiderCarriedInProductivity] = useState(false);
  const productivityActivities = useMemo(
    () => (considerCarriedInProductivity ? filtered : filtered.filter((a) => !a.isCarried)),
    [filtered, considerCarriedInProductivity],
  );
  const realizedProductivity = useMemo(
    () => computeRealizedProductivity(productivityActivities, hoursPerPf, assumedTestSharePercent),
    [productivityActivities, hoursPerPf, assumedTestSharePercent],
  );
  const people = useMemo(() => computePersonSummaries(filtered), [filtered]);
  const hoursPerPfByDeveloper = useMemo(
    () => computeHoursPerPfByDeveloper(filtered, 100 - assumedTestSharePercent),
    [filtered, assumedTestSharePercent],
  );
  const sprintSummaries = useMemo(() => computeSprintSummaries(filtered), [filtered]);
  const statusSummaries = useMemo(() => computeStatusSummaries(filtered), [filtered]);
  const topBuggy = useMemo(() => topActivitiesByBugCount(filtered, 10), [filtered]);

  const atRisk = filtered.filter((a) => a.isOverdue);
  const carried = filtered.filter((a) => a.isCarried);

  const maxBugs = Math.max(1, ...people.map((p) => p.bugs));
  const maxStoryPoints = Math.max(1, ...people.map((p) => p.storyPoints));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <FilterPill label="Todas as sprints" active={sprintFilter.length === 0} onClick={() => onSprintClick('all', false)} />
          {sprints.map((s) => (
            <FilterPill
              key={s.id}
              label={s.name}
              active={sprintFilter.includes(s.id)}
              onClick={(e) => onSprintClick(s.id, e.shiftKey)}
            />
          ))}
        </div>
        <p style={{ fontSize: 10.5, color: 'var(--text-muted)', margin: '6px 0 0' }}>
          Segure <strong>Shift</strong> e clique para combinar várias sprints no filtro.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
        <Section title="Atividades por status">
          <StatusPieChart summaries={statusSummaries} />
        </Section>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <Kpi label="Atividades" value={kpis.totalActivities} />
        <Kpi label="Story points totais" value={kpis.totalStoryPoints} />
        <Kpi label="Concluídas" value={kpis.doneCount} suffix={`/${kpis.totalActivities}`} accent="var(--status-good)" />
        <Kpi label="Em risco" value={kpis.atRiskCount} suffix={`/${kpis.totalActivities}`} accent="var(--status-critical)" />
        <Kpi label="Herdadas" value={kpis.carriedCount} suffix={`/${kpis.totalActivities}`} accent="var(--status-warning)" />
        <Kpi label="Tarefas adicionadas" value={kpis.addedLateCount} suffix={`/${kpis.totalActivities}`} accent="var(--status-warning)" />
        <Kpi label="Pontos adicionados" value={kpis.addedLateStoryPoints} accent="var(--status-warning)" />
        <Kpi label="Em andamento (no prazo)" value={kpis.inProgressOnTimeCount} />
        <Kpi label="Bugs abertos" value={kpis.openBugsCount} />
        <Kpi label="Bugs por atividade" value={kpis.bugsPerActivity.toFixed(1)} />
        <Kpi
          label="Horas / PF (geral)"
          value={realizedProductivity.hoursPerPf !== null ? realizedProductivity.hoursPerPf.toFixed(2) : '—'}
          suffix={
            realizedProductivity.sampleSize > 0
              ? `${realizedProductivity.sampleSize} concluída${realizedProductivity.sampleSize > 1 ? 's' : ''} · estimado ${hoursPerPf.toFixed(2)}`
              : 'sem concluídas com apontamento'
          }
          accent={
            realizedProductivity.hoursPerPf === null
              ? undefined
              : realizedProductivity.hoursPerPf > hoursPerPf
                ? 'var(--status-warning)'
                : 'var(--status-good)'
          }
          title="Média de horas por Ponto de Função realmente apontadas (worklog de Implementação + Teste) nas tarefas concluídas, ponderada pelos PFs de cada tarefa e comparada com a estimativa configurada. Atualiza sozinho conforme mais tarefas são concluídas e mais apontamentos são lançados."
        />
        <Kpi
          label={`Horas / PF (Impl., ${(100 - assumedTestSharePercent).toFixed(0)}%)`}
          value={realizedProductivity.hoursPerPfImpl !== null ? realizedProductivity.hoursPerPfImpl.toFixed(2) : '—'}
          suffix={
            realizedProductivity.sampleSize > 0
              ? `${realizedProductivity.sampleSize} concluída${realizedProductivity.sampleSize > 1 ? 's' : ''} · estimado ${hoursPerPf.toFixed(2)}`
              : 'sem concluídas com apontamento'
          }
          accent={
            realizedProductivity.hoursPerPfImpl === null
              ? undefined
              : realizedProductivity.hoursPerPfImpl > hoursPerPf
                ? 'var(--status-warning)'
                : 'var(--status-good)'
          }
          title={`Mesma média de Horas/PF, olhando só as horas de Implementação apontadas sobre o PF dedicado à Implementação (${(100 - assumedTestSharePercent).toFixed(0)}% do PF de cada tarefa concluída).`}
        />
        <Kpi
          label={`Horas / PF (Teste, ${assumedTestSharePercent.toFixed(0)}%)`}
          value={realizedProductivity.hoursPerPfTest !== null ? realizedProductivity.hoursPerPfTest.toFixed(2) : '—'}
          suffix={
            realizedProductivity.sampleSize > 0
              ? `${realizedProductivity.sampleSize} concluída${realizedProductivity.sampleSize > 1 ? 's' : ''} · estimado ${hoursPerPf.toFixed(2)}`
              : 'sem concluídas com apontamento'
          }
          accent={
            realizedProductivity.hoursPerPfTest === null
              ? undefined
              : realizedProductivity.hoursPerPfTest > hoursPerPf
                ? 'var(--status-warning)'
                : 'var(--status-good)'
          }
          title={`Mesma média de Horas/PF, olhando só as horas de Teste apontadas sobre o PF dedicado ao Teste (${assumedTestSharePercent.toFixed(0)}% do PF de cada tarefa concluída).`}
        />
        <Kpi
          label="% de Assertividade"
          value={realizedProductivity.accuracyPercent !== null ? `${realizedProductivity.accuracyPercent.toFixed(0)}%` : '—'}
          suffix={
            realizedProductivity.sampleSize > 0
              ? `${realizedProductivity.sampleSize} concluída${realizedProductivity.sampleSize > 1 ? 's' : ''}`
              : 'sem concluídas'
          }
          accent={accuracyAccent(realizedProductivity.accuracyPercent)}
          title="Total de horas apontadas (worklog de Implementação + Teste) dividido pelo total de horas estimadas (PF × horas/PF) nas tarefas concluídas. 100% = a estimativa bateu exatamente com o apontado. Abaixo de 100%, superestimamos (levou menos tempo que o previsto); acima de 100%, subestimamos (levou mais tempo que o previsto). Atualiza sozinho conforme mais tarefas são concluídas."
        />
        <Kpi
          label="% de Assertividade (c/ bugs)"
          value={realizedProductivity.accuracyWithBugsPercent !== null ? `${realizedProductivity.accuracyWithBugsPercent.toFixed(0)}%` : '—'}
          suffix={
            realizedProductivity.sampleSize > 0
              ? `${realizedProductivity.sampleSize} concluída${realizedProductivity.sampleSize > 1 ? 's' : ''}`
              : 'sem concluídas'
          }
          accent={accuracyAccent(realizedProductivity.accuracyWithBugsPercent)}
          title="Mesma % de Assertividade acima, mas somando também as horas apontadas em bugs — reflete o esforço real total, incluindo correções encontradas durante o teste que não entraram na estimativa original."
        />
        <Kpi
          label="% de Teste"
          value={realizedProductivity.testSharePercent !== null ? `${realizedProductivity.testSharePercent.toFixed(0)}%` : '—'}
          suffix={
            realizedProductivity.sampleSize > 0
              ? `${realizedProductivity.sampleSize} concluída${realizedProductivity.sampleSize > 1 ? 's' : ''} · estimado ${assumedTestSharePercent.toFixed(0)}%`
              : 'sem concluídas'
          }
          accent={
            realizedProductivity.testSharePercent === null
              ? undefined
              : Math.abs(realizedProductivity.testSharePercent - assumedTestSharePercent) <= 5
                ? 'var(--status-good)'
                : Math.abs(realizedProductivity.testSharePercent - assumedTestSharePercent) <= 15
                  ? 'var(--status-warning)'
                  : 'var(--status-critical)'
          }
          title="Quanto do tempo total (Implementação + Teste apontados) foi de fato Teste, nas tarefas concluídas — bugs ficam de fora dessa conta. Compara com o percentual assumido hoje (fixo) ao projetar a janela prevista de Teste, pra ver se essa suposição bate com a realidade. Atualiza sozinho conforme mais tarefas são concluídas."
        />
      </div>

        <label
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-secondary)', cursor: 'pointer', marginTop: 8 }}
          title="Quando desmarcado (padrão), os indicadores de Horas/PF e % de Assertividade acima ignoram tarefas herdadas de sprints anteriores — elas costumam ficar muito tempo paradas antes da entrega e distorcem o cálculo."
        >
          <input
            type="checkbox"
            checked={considerCarriedInProductivity}
            onChange={(e) => setConsiderCarriedInProductivity(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          Considerar herdadas nos indicadores de Horas/PF e % de Assertividade
        </label>
      </div>
      </div>
      </div>

      <div title={`Horas de Implementação apontadas dividido pelo PF de Implementação (Story Points × fração de Implementação, hoje ${(100 - assumedTestSharePercent).toFixed(0)}%) — considera TODAS as tarefas do dev, concluídas ou não. Ordenado do mais eficiente (menos horas por PF) para o menos.`}>
        <Section title="Horas / PF por dev">
          {hoursPerPfByDeveloper.length === 0 ? (
            <Empty text="Sem dados." />
          ) : (
            <Table
              columns={['Desenvolvedor', `PF Impl. (${(100 - assumedTestSharePercent).toFixed(0)}%)`, 'Horas Impl.', 'Horas/PF']}
              rows={hoursPerPfByDeveloper.map((p) => [
                p.developer,
                p.pfImpl.toFixed(2),
                p.implHours.toFixed(1),
                p.hoursPerPf !== null ? p.hoursPerPf.toFixed(2) : '—',
              ])}
            />
          )}
        </Section>
      </div>

      <Section title="⚠️ Atividades em risco (previsão vencida e não concluídas)">
        {atRisk.length === 0 ? (
          <Empty text="Nenhuma atividade em risco." />
        ) : (
          <Table
            columns={['Atividade', 'Sprint', 'Responsável', 'Previsão', 'SP']}
            rows={atRisk.map((a) => [
              `${a.key} - ${a.title}`,
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
              `${a.key} - ${a.title}`,
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
              `${a.key} - ${a.title}`,
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

/** Verde perto de 100% (bateu a estimativa), amarelo moderadamente longe, vermelho muito longe. */
function accuracyAccent(accuracyPercent: number | null): string | undefined {
  if (accuracyPercent === null) return undefined;
  const distance = Math.abs(accuracyPercent - 100);
  if (distance <= 10) return 'var(--status-good)';
  if (distance <= 30) return 'var(--status-warning)';
  return 'var(--status-critical)';
}

function Kpi({
  label,
  value,
  suffix,
  accent,
  title,
}: {
  label: string;
  value: number | string;
  suffix?: string;
  accent?: string;
  title?: string;
}) {
  return (
    <div
      title={title}
      style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--gridline)',
        borderRadius: 10,
        padding: '12px 14px',
        cursor: title ? 'help' : undefined,
      }}
    >
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
