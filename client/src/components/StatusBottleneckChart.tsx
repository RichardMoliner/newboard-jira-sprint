import type { StatusCycleTimeSummary } from '../indicators/computeIndicators.js';

const BAR_HEIGHT = 16;
const ROW_GAP = 10;
const LABEL_WIDTH = 150;

/** "3,2 dias" / "1 dia" / "0 dias" — vírgula decimal só quando necessário. */
function formatDays(days: number): string {
  const rounded = Math.round(days * 10) / 10;
  const text = rounded.toFixed(1).replace('.0', '').replace('.', ',');
  return `${text} dia${rounded === 1 ? '' : 's'}`;
}

export default function StatusBottleneckChart({ summaries }: { summaries: StatusCycleTimeSummary[] }) {
  const hasData = summaries.some((s) => s.averageDays > 0);

  if (!hasData) {
    return <p style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>Nenhum status fechado ainda no recorte atual.</p>;
  }

  // Largura relativa ao maior valor da lista (não a um teto fixo como 100%, já que aqui o valor é
  // em dias, sem limite natural) — assim a barra mais lenta sempre preenche a linha inteira e as
  // outras ficam proporcionais a ela.
  const maxDays = Math.max(...summaries.map((s) => s.averageDays));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: ROW_GAP }}>
      {summaries.map((s) => {
        const widthPercent = maxDays > 0 ? (s.averageDays / maxDays) * 100 : 0;
        return (
          <div key={s.status} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5 }}>
            <span
              style={{
                width: LABEL_WIDTH,
                flexShrink: 0,
                color: 'var(--text-secondary)',
                textAlign: 'right',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={s.status}
            >
              {s.status}
            </span>
            <div style={{ flex: 1, background: 'var(--gridline)', borderRadius: BAR_HEIGHT / 2, height: BAR_HEIGHT, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${widthPercent}%`,
                  height: '100%',
                  background: 'var(--series-impl)',
                  borderRadius: BAR_HEIGHT / 2,
                }}
                title={`${s.status}: ${formatDays(s.averageDays)} em média`}
              />
            </div>
            <span style={{ width: 56, flexShrink: 0, color: 'var(--text-muted)' }}>{formatDays(s.averageDays)}</span>
          </div>
        );
      })}
    </div>
  );
}
