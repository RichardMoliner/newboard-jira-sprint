import type { Activity, SprintInfo } from '../types.js';
import { formatConsumedPercent, formatHoursMinutes, formatHoursPair, groupBugsByArtifact } from './TimelineView.js';
import IndicatorsView from './IndicatorsView.js';

function formatShort(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

/** Mesmo critério do badge de status da Linha do tempo (StatusBadge), como texto puro. */
export function describeActivityStatus(activity: Activity): string {
  if (activity.isDone) return 'Concluída';
  if (activity.notStarted) return 'Ainda não iniciada';
  if (activity.testDone) return 'Aguardando liberação';
  if (activity.isOverdue) return `Atrasada - ${activity.status}`;
  return activity.status;
}

/** "N bugs (Requisito: X, Implementação: Y, ...)" — null sem nenhum bug. Só a contagem por
 * artefato, sem listar os bugs individualmente (o relatório é estático, não dá pra expandir). */
export function describeBugSummary(activity: Activity): string | null {
  if (activity.bugs.length === 0) return null;
  const groups = groupBugsByArtifact(activity.bugs);
  const parts = groups.map((g) => `${g.label}: ${g.bugs.length}`);
  return `${activity.bugs.length} bug${activity.bugs.length > 1 ? 's' : ''} (${parts.join(', ')})`;
}

/** Agrupa as atividades por desenvolvedor, ordenado alfabeticamente — leitura mais previsível num
 * relatório estático do que a ordem de conclusão usada na Linha do tempo. */
export function groupActivitiesByDeveloper(activities: Activity[]): [string, Activity[]][] {
  const map = new Map<string, Activity[]>();
  for (const a of activities) {
    const list = map.get(a.developer) ?? [];
    list.push(a);
    map.set(a.developer, list);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

export default function ReportView({
  activities,
  sprints,
  today,
  sprintFilter,
  onSprintClick,
  hoursPerPfBySprintId,
  assumedTestSharePercent,
  vertical,
  onClose,
}: {
  activities: Activity[];
  sprints: SprintInfo[];
  today: string;
  sprintFilter: string[];
  onSprintClick: (id: string, shiftKey: boolean) => void;
  hoursPerPfBySprintId: Record<string, number>;
  assumedTestSharePercent: number;
  vertical: string;
  onClose: () => void;
}) {
  const filtered = sprintFilter.length === 0 ? activities : activities.filter((a) => sprintFilter.includes(a.sprintId));
  const grouped = groupActivitiesByDeveloper(filtered);
  const sprintLabel =
    sprintFilter.length === 0
      ? 'Todas as sprints'
      : sprints
          .filter((s) => sprintFilter.includes(s.id))
          .map((s) => s.name)
          .join(', ');

  return (
    <div style={{ padding: '24px 32px 60px' }}>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <button onClick={onClose} style={secondaryButtonStyle}>
          ← Voltar
        </button>
        <button onClick={() => window.print()} style={primaryButtonStyle}>
          🖨️ Imprimir / Salvar PDF
        </button>
      </div>

      <h1 style={{ fontSize: 20, margin: '0 0 4px' }}>Relatório — {vertical}</h1>
      <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 28px' }}>
        {sprintLabel} · gerado em {formatShort(today)}
      </p>

      <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>Indicadores</h2>
      <IndicatorsView
        activities={activities}
        sprints={sprints}
        today={today}
        sprintFilter={sprintFilter}
        onSprintClick={onSprintClick}
        hoursPerPfBySprintId={hoursPerPfBySprintId}
        assumedTestSharePercent={assumedTestSharePercent}
      />

      <h2 style={{ fontSize: 16, margin: '28px 0 12px' }}>Tarefas ({filtered.length})</h2>
      {grouped.map(([developer, items]) => (
        <div key={developer} style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 13, color: 'var(--series-impl)', margin: '0 0 8px' }}>{developer}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map((activity) => (
              <ReportActivityCard key={activity.key} activity={activity} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ReportActivityCard({ activity }: { activity: Activity }) {
  const firstTestWorklogDate = activity.worklogEntries.find((e) => e.subtaskType === 'Teste')?.date ?? null;
  const bugSummary = describeBugSummary(activity);
  const implConsumed = formatConsumedPercent(activity.implLoggedHours, activity.implEstimatedHours);
  const testConsumed = formatConsumedPercent(activity.testLoggedHours, activity.testEstimatedHours);

  return (
    <div style={{ border: '1px solid var(--gridline)', borderRadius: 8, padding: '10px 14px', fontSize: 11.5, breakInside: 'avoid' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <a
          href={activity.url}
          target="_blank"
          rel="noreferrer"
          style={{ fontWeight: 600, color: 'var(--text-primary)', textDecoration: 'none' }}
        >
          {activity.key} - {activity.title}
        </a>
        <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{describeActivityStatus(activity)}</span>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4, fontSize: 10.5, color: 'var(--text-secondary)' }}>
        {activity.isCarried && <span>🕓 Herdada</span>}
        {activity.addedAfterSprintStart && <span>➕ Adicionada</span>}
        {(activity.isDone || activity.testDone) && activity.deliveredOnTime !== null && (
          <span>{activity.deliveredOnTime ? '✓ No prazo' : '✗ Fora do prazo'}</span>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 4,
          marginTop: 6,
          fontSize: 10.5,
          color: 'var(--text-secondary)',
        }}
      >
        <Field label="PF" value={activity.storyPoints ?? '—'} />
        <Field label="Dev" value={activity.developer} />
        <Field label="Tester" value={activity.tester ?? '—'} />
        {!activity.notStarted && <Field label="Início dev" value={formatShort(activity.startDate)} />}
        {activity.implDoneDate && <Field label="Fim dev" value={formatShort(activity.implDoneDate)} />}
        {firstTestWorklogDate && <Field label="Início teste" value={formatShort(firstTestWorklogDate)} />}
        {(activity.isDone || activity.testDone) && activity.deliveredDate && (
          <Field label="Fim teste" value={formatShort(activity.deliveredDate)} />
        )}
        {activity.isOverdue && activity.dueDate && <Field label="Atrasada desde" value={formatShort(activity.dueDate)} critical />}
        <Field label="Impl. (h)" value={`${formatHoursPair(activity.implLoggedHours, activity.implEstimatedHours)}${implConsumed ? ` (${implConsumed})` : ''}`} />
        <Field label="Teste (h)" value={`${formatHoursPair(activity.testLoggedHours, activity.testEstimatedHours)}${testConsumed ? ` (${testConsumed})` : ''}`} />
        {activity.bugsLoggedHours !== null && (
          <>
            <Field label="Impl Bugs (h)" value={formatHoursMinutes(activity.implBugsLoggedHours ?? 0)} />
            <Field label="Teste Bugs (h)" value={formatHoursMinutes(activity.testBugsLoggedHours ?? 0)} />
          </>
        )}
        <Field label="Assert." value={activity.assertividadePercent !== null ? `${Math.round(activity.assertividadePercent)}%` : '—'} />
        {activity.bugs.length > 0 && (
          <Field
            label="Assert. c/ bugs"
            value={activity.assertividadeComBugsPercent !== null ? `${Math.round(activity.assertividadeComBugsPercent)}%` : '—'}
          />
        )}
      </div>

      {bugSummary && <div style={{ marginTop: 6, fontSize: 10.5, color: 'var(--series-bug)' }}>{bugSummary}</div>}
    </div>
  );
}

function Field({ label, value, critical }: { label: string; value: React.ReactNode; critical?: boolean }) {
  return (
    <div>
      <span style={{ color: critical ? 'var(--status-critical)' : 'var(--text-muted)' }}>{label}: </span>
      {value}
    </div>
  );
}

const primaryButtonStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 8,
  border: 'none',
  background: 'var(--series-impl)',
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 8,
  border: '1px solid var(--baseline)',
  background: 'var(--surface-1)',
  color: 'var(--text-secondary)',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};
