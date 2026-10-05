import { useState } from 'react';
import { getHistoricalSprints, getHistoricalBoardData, getBoardDataProgress } from '../api/client.js';
import type { BoardDataResponse, SprintInfo } from '../types.js';
import { FilterPill } from './TimelineView.js';
import IndicatorsView from './IndicatorsView.js';
import ProgressModal from './ProgressModal.js';

const PROGRESS_POLL_MS = 800;

function defaultSince(): string {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return d.toISOString().slice(0, 10);
}

export default function HistoryView() {
  const [since, setSince] = useState(defaultSince());
  const [discovering, setDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [availableSprints, setAvailableSprints] = useState<SprintInfo[]>([]);
  const [selectedSprintIds, setSelectedSprintIds] = useState<string[]>([]);

  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [progressMessages, setProgressMessages] = useState<string[]>([]);
  const [historicalData, setHistoricalData] = useState<BoardDataResponse | null>(null);
  const [historicalSprintFilter, setHistoricalSprintFilter] = useState<string[]>([]);

  async function handleDiscover() {
    setDiscovering(true);
    setDiscoverError(null);
    setAvailableSprints([]);
    setSelectedSprintIds([]);
    setHistoricalData(null);
    try {
      const { sprints } = await getHistoricalSprints(since);
      setAvailableSprints(sprints);
    } catch (err) {
      setDiscoverError(err instanceof Error ? err.message : 'Erro ao buscar sprints encerradas.');
    } finally {
      setSearched(true);
      setDiscovering(false);
    }
  }

  function toggleSprint(id: string) {
    setSelectedSprintIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleLoadIndicators() {
    if (selectedSprintIds.length === 0) return;
    setLoadingData(true);
    setDataError(null);
    setProgressMessages([]);
    setHistoricalSprintFilter([]);

    const pollProgress = async () => {
      try {
        const { messages } = await getBoardDataProgress();
        setProgressMessages(messages);
      } catch {
        // Falha ao consultar o progresso não deve interromper a busca principal.
      }
    };
    const progressInterval = setInterval(pollProgress, PROGRESS_POLL_MS);

    try {
      const data = await getHistoricalBoardData<BoardDataResponse>(selectedSprintIds);
      setHistoricalData(data);
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Erro ao buscar indicadores históricos.');
    } finally {
      clearInterval(progressInterval);
      setLoadingData(false);
    }
  }

  // Mesma semântica de clique da Indicadores/Linha do tempo: clique normal seleciona só aquela
  // sprint, shift+clique soma/remove da seleção — mas aqui dentro do subconjunto já carregado.
  function handleHistoricalSprintClick(id: string, shiftKey: boolean) {
    if (id === 'all') {
      setHistoricalSprintFilter([]);
      return;
    }
    if (shiftKey) {
      setHistoricalSprintFilter((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    } else {
      setHistoricalSprintFilter([id]);
    }
  }

  return (
    <div style={{ paddingBottom: 60 }}>
      {loadingData && <ProgressModal messages={progressMessages} />}

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 12,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: 'var(--text-secondary)' }}>
          Mostrar sprints encerradas a partir de:
          <input type="date" value={since} onChange={(e) => setSince(e.target.value)} style={inputStyle} />
        </label>
        <button onClick={handleDiscover} disabled={discovering} style={primaryButtonStyle(discovering)}>
          {discovering ? 'Buscando...' : 'Buscar sprints'}
        </button>
      </div>

      {discoverError && <p style={{ color: 'var(--status-critical)', fontSize: 13 }}>{discoverError}</p>}

      {searched && !discovering && !discoverError && availableSprints.length === 0 && (
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Nenhuma sprint encerrada encontrada a partir dessa data.</p>
      )}

      {availableSprints.length > 0 && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {availableSprints.map((sprint) => (
              <FilterPill
                key={sprint.id}
                label={sprint.name}
                active={selectedSprintIds.includes(sprint.id)}
                onClick={() => toggleSprint(sprint.id)}
                tooltip={`${sprint.startDate} a ${sprint.endDate}`}
              />
            ))}
          </div>
          <button
            onClick={handleLoadIndicators}
            disabled={selectedSprintIds.length === 0 || loadingData}
            style={{ ...primaryButtonStyle(loadingData), marginBottom: 20 }}
          >
            {loadingData ? 'Carregando...' : 'Carregar indicadores'}
          </button>
        </>
      )}

      {dataError && <p style={{ color: 'var(--status-critical)', fontSize: 13 }}>{dataError}</p>}

      {historicalData && (
        <IndicatorsView
          activities={historicalData.activities}
          sprints={historicalData.sprints}
          today={historicalData.today}
          hoursPerPf={historicalData.hoursPerPf}
          assumedTestSharePercent={historicalData.assumedTestSharePercent}
          sprintFilter={historicalSprintFilter}
          onSprintClick={handleHistoricalSprintClick}
        />
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--baseline)',
  background: 'var(--page-plane)',
  color: 'var(--text-primary)',
  fontSize: 14,
};

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
