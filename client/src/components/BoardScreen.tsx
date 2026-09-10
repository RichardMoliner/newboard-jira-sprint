import { useState } from 'react';
import { useBoardData } from '../api/useBoardData.js';
import TimelineView from './TimelineView.js';
import IndicatorsView from './IndicatorsView.js';

type Tab = 'timeline' | 'indicators';

export default function BoardScreen({
  vertical,
  onChangeVertical,
}: {
  vertical: string;
  onChangeVertical: () => void;
}) {
  const { data, loading, error, refresh } = useBoardData();
  const [tab, setTab] = useState<Tab>('timeline');
  const [sprintFilter, setSprintFilter] = useState<string>('all');

  return (
    <div style={{ padding: '24px 32px 60px' }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, margin: 0 }}>Painel de acompanhamento — {vertical}</h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
            {data ? `Atualizado às ${formatTime(data.generatedAt)}` : loading ? 'Buscando dados do Jira...' : 'Sem dados ainda'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onChangeVertical} style={secondaryButtonStyle}>
            Configurações
          </button>
          <button onClick={refresh} disabled={loading} style={primaryButtonStyle(loading)}>
            {loading ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>
      </header>

      {error && (
        <div
          style={{
            background: 'var(--surface-1)',
            border: '1px solid var(--status-critical)',
            color: 'var(--status-critical)',
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {!data && loading && <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Carregando painel...</p>}

      {data && (
        <>
          <nav style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--gridline)', marginBottom: 20 }}>
            <TabButton active={tab === 'timeline'} onClick={() => setTab('timeline')} label="Linha do tempo" />
            <TabButton active={tab === 'indicators'} onClick={() => setTab('indicators')} label="Indicadores" />
          </nav>

          {tab === 'timeline' ? (
            <TimelineView
              activities={data.activities}
              sprints={data.sprints}
              today={data.today}
              sprintFilter={sprintFilter}
              onChangeSprintFilter={setSprintFilter}
            />
          ) : (
            <IndicatorsView
              activities={data.activities}
              sprints={data.sprints}
              today={data.today}
              sprintFilter={sprintFilter}
              onChangeSprintFilter={setSprintFilter}
            />
          )}
        </>
      )}
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '9px 16px',
        fontSize: 13,
        fontWeight: 600,
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        background: 'none',
        border: 'none',
        borderBottom: active ? '2px solid var(--series-impl)' : '2px solid transparent',
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {label}
    </button>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

const primaryButtonStyle = (disabled: boolean): React.CSSProperties => ({
  padding: '8px 16px',
  borderRadius: 8,
  border: 'none',
  background: 'var(--series-impl)',
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  cursor: disabled ? 'default' : 'pointer',
  opacity: disabled ? 0.7 : 1,
});

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
