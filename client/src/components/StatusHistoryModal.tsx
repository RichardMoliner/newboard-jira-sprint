import type { Activity } from '../types.js';

/** Dias corridos entre duas datas `YYYY-MM-DD` (os dados já vêm truncados assim do servidor). */
function daysBetween(startISO: string, endISO: string): number {
  return Math.round((Date.parse(endISO) - Date.parse(startISO)) / (24 * 60 * 60 * 1000));
}

export function formatDurationDays(days: number): string {
  return `${days} dia${days === 1 ? '' : 's'}`;
}

export default function StatusHistoryModal({ activity, onClose }: { activity: Activity; onClose: () => void }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.45)',
      }}
    >
      <div
        style={{
          background: 'var(--surface-1)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 28,
          width: 320,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div>
          <h2 style={{ fontSize: 16, margin: 0 }}>Histórico de status</h2>
          <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
            {activity.key} - {activity.title}
          </p>
        </div>

        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {activity.statusHistory.map((segment, index) => (
            <li
              key={`${segment.status}-${segment.start}-${index}`}
              style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}
            >
              <span style={{ color: 'var(--text-primary)' }}>{segment.status}</span>
              <span style={{ color: 'var(--text-secondary)' }}>{formatDurationDays(daysBetween(segment.start, segment.end))}</span>
            </li>
          ))}
        </ul>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              padding: '9px 16px',
              borderRadius: 8,
              border: '1px solid var(--baseline)',
              background: 'var(--surface-1)',
              color: 'var(--text-secondary)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
