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
  const { data, loading, error, refresh, secondsToNextRefresh } = useBoardData();
  const [tab, setTab] = useState<Tab>('timeline');
  const [sprintFilter, setSprintFilter] = useState<string[]>([]);

  // Clique normal seleciona só aquela sprint; shift+clique soma/remove da seleção atual,
  // permitindo combinar várias sprints no filtro.
  function handleSprintClick(id: string, shiftKey: boolean) {
    if (id === 'all') {
      setSprintFilter([]);
      return;
    }
    if (shiftKey) {
      setSprintFilter((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    } else {
      setSprintFilter([id]);
    }
  }

  return (
    <div style={{ padding: '24px 32px 60px' }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Painel de acompanhamento — {vertical}</h1>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onChangeVertical} style={secondaryButtonStyle}>
              Configurações
            </button>
            <button onClick={refresh} disabled={loading} style={primaryButtonStyle(loading)}>
              {loading ? 'Atualizando...' : 'Atualizar'}
            </button>
          </div>
          <p className="tabular-nums" style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0 }}>
            {data ? (
              <>
                Atualizado às {formatTime(data.generatedAt)}
                {!loading && ` · Próxima em ${formatCountdown(secondsToNextRefresh)}`}
              </>
            ) : loading ? (
              'Buscando dados do Jira...'
            ) : (
              'Sem dados ainda'
            )}
          </p>
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
              hoursPerPf={data.hoursPerPf}
              hoursPerDay={data.hoursPerDay}
              sprintFilter={sprintFilter}
              onSprintClick={handleSprintClick}
            />
          ) : (
            <IndicatorsView
              activities={data.activities}
              sprints={data.sprints}
              today={data.today}
              hoursPerPf={data.hoursPerPf}
              sprintFilter={sprintFilter}
              onSprintClick={handleSprintClick}
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

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
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
