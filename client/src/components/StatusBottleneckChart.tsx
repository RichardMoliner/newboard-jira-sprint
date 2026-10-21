import type { StatusCycleTimeSummary } from '../indicators/computeIndicators.js';

const BAR_HEIGHT = 16;
const ROW_GAP = 10;
const LABEL_WIDTH = 150;

export default function StatusBottleneckChart({ summaries }: { summaries: StatusCycleTimeSummary[] }) {
  const hasData = summaries.some((s) => s.averagePercent > 0);

  if (!hasData) {
    return <p style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>Sem tarefas concluídas no recorte atual.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: ROW_GAP }}>
      {summaries.map((s) => {
        const percent = Math.round(s.averagePercent);
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
                  // Clamp pra sempre cair em [0, 100] — a largura é relativa ao total de 100%, não ao
                  // maior valor da lista, pra comparar visualmente entre status.
                  width: `${Math.max(0, Math.min(100, s.averagePercent))}%`,
                  height: '100%',
                  background: 'var(--series-impl)',
                  borderRadius: BAR_HEIGHT / 2,
                }}
                title={`${s.status}: ${percent}%`}
              />
            </div>
            <span style={{ width: 36, flexShrink: 0, color: 'var(--text-muted)' }}>{percent}%</span>
          </div>
        );
      })}
    </div>
  );
}
