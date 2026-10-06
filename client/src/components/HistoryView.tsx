import { useEffect, useMemo, useRef, useState } from 'react';
import { getHistoricalSprints, getHistoricalBoardData, getBoardDataProgress } from '../api/client.js';
import type { BoardDataResponse, SprintInfo, SprintSettings } from '../types.js';
import IndicatorsView from './IndicatorsView.js';
import ProgressModal from './ProgressModal.js';

const PROGRESS_POLL_MS = 800;

function defaultSince(): string {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return d.toISOString().slice(0, 10);
}

function formatBr(isoDate: string): string {
  const [, m, d] = isoDate.split('-');
  return `${d}/${m}`;
}

export default function HistoryView({ sprintSettingsById }: { sprintSettingsById: Record<string, SprintSettings> }) {
  const [since, setSince] = useState(defaultSince());
  const [discovering, setDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [availableSprints, setAvailableSprints] = useState<SprintInfo[]>([]);
  const [selectedSprintIds, setSelectedSprintIds] = useState<string[]>([]);
  const [sprintSearch, setSprintSearch] = useState('');
  // Depois de carregar, recolhe o bloco de seleção num resumo — evita duas fileiras de controles
  // parecidos (a seleção de sprints pra buscar e os filtros do próprio painel de Indicadores)
  // disputando atenção ao mesmo tempo. "Alterar seleção" reabre pra ajustar e buscar de novo.
  const [editingSelection, setEditingSelection] = useState(true);

  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [progressMessages, setProgressMessages] = useState<string[]>([]);
  const [historicalData, setHistoricalData] = useState<BoardDataResponse | null>(null);
  const [historicalSprintFilter, setHistoricalSprintFilter] = useState<string[]>([]);

  const selectAllRef = useRef<HTMLInputElement>(null);

  const filteredSprints = useMemo(() => {
    const query = sprintSearch.trim().toLowerCase();
    if (!query) return availableSprints;
    return availableSprints.filter((s) => s.name.toLowerCase().includes(query));
  }, [availableSprints, sprintSearch]);

  const selectedSprints = useMemo(
    () => availableSprints.filter((s) => selectedSprintIds.includes(s.id)),
    [availableSprints, selectedSprintIds],
  );

  async function handleDiscover() {
    setDiscovering(true);
    setDiscoverError(null);
    setAvailableSprints([]);
    setSelectedSprintIds([]);
    setSprintSearch('');
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

  // "Marcar/desmarcar todas" age só sobre as sprints visíveis no momento (já filtradas pela data de
  // abertura buscada e pela busca por nome) — sprints selecionadas antes de filtrar a lista, mas que
  // ficaram fora do filtro atual, permanecem selecionadas (não some seleção escondida da vista).
  const allFilteredSelected = filteredSprints.length > 0 && filteredSprints.every((s) => selectedSprintIds.includes(s.id));
  const someFilteredSelected = filteredSprints.some((s) => selectedSprintIds.includes(s.id));

  function toggleSelectAllFiltered() {
    const filteredIds = new Set(filteredSprints.map((s) => s.id));
    setSelectedSprintIds((prev) =>
      allFilteredSelected ? prev.filter((id) => !filteredIds.has(id)) : [...new Set([...prev, ...filteredIds])],
    );
  }

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someFilteredSelected && !allFilteredSelected;
    }
  }, [someFilteredSelected, allFilteredSelected]);

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
      setEditingSelection(false);
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

  const showSelectionPanel = !historicalData || editingSelection;

  const hoursPerPfBySprintId = useMemo(() => {
    if (!historicalData) return {};
    return Object.fromEntries(
      historicalData.sprints.map((s) => [s.id, sprintSettingsById[s.id]?.hoursPerPf ?? historicalData.defaultHoursPerPf]),
    );
  }, [historicalData, sprintSettingsById]);

  return (
    <div style={{ paddingBottom: 60 }}>
      {loadingData && <ProgressModal messages={progressMessages} />}

      {!showSelectionPanel && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 20,
            padding: '10px 14px',
            borderRadius: 8,
            background: 'var(--surface-1)',
            border: '1px solid var(--gridline)',
            fontSize: 13,
          }}
        >
          <span style={{ color: 'var(--text-secondary)' }}>Exibindo indicadores de:</span>
          <strong style={{ color: 'var(--text-primary)' }}>{selectedSprints.map((s) => s.name).join(', ')}</strong>
          <button onClick={() => setEditingSelection(true)} style={linkButtonStyle}>
            Alterar seleção
          </button>
        </div>
      )}

      {showSelectionPanel && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
            Veja os mesmos indicadores da aba Indicadores, mas para sprints já encerradas.
          </p>

          <div style={{ marginBottom: 16 }}>
            <p style={stepLabelStyle}>1. Escolha a partir de quando buscar sprints encerradas</p>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                Data de abertura da sprint
                <input type="date" value={since} onChange={(e) => setSince(e.target.value)} style={inputStyle} />
              </label>
              <button onClick={handleDiscover} disabled={discovering} style={primaryButtonStyle(discovering)}>
                {discovering ? 'Buscando...' : 'Buscar sprints'}
              </button>
            </div>
          </div>

          {discoverError && <p style={{ color: 'var(--status-critical)', fontSize: 13 }}>{discoverError}</p>}

          {searched && !discovering && !discoverError && availableSprints.length === 0 && (
            <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Nenhuma sprint encerrada encontrada a partir dessa data.</p>
          )}

          {availableSprints.length > 0 && (
            <div>
              <p style={stepLabelStyle}>2. Selecione as sprints que deseja analisar</p>

              <input
                type="text"
                value={sprintSearch}
                onChange={(e) => setSprintSearch(e.target.value)}
                placeholder="Buscar sprint pelo nome..."
                style={{ ...inputStyle, width: '100%', maxWidth: 360, marginBottom: 10, display: 'block' }}
              />

              {filteredSprints.length > 0 && (
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '6px 12px',
                    fontSize: 12.5,
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    ref={selectAllRef}
                    checked={allFilteredSelected}
                    onChange={toggleSelectAllFiltered}
                    style={{ cursor: 'pointer' }}
                  />
                  {allFilteredSelected ? 'Desmarcar todas' : 'Marcar todas'}
                  {sprintSearch.trim() && ' (filtradas)'}
                </label>
              )}

              <div
                style={{
                  maxHeight: 280,
                  overflowY: 'auto',
                  border: '1px solid var(--gridline)',
                  borderRadius: 8,
                  background: 'var(--page-plane)',
                  marginBottom: 10,
                }}
              >
                {filteredSprints.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '10px 12px', margin: 0 }}>
                    Nenhuma sprint corresponde à busca.
                  </p>
                ) : (
                  filteredSprints.map((sprint) => {
                    const checked = selectedSprintIds.includes(sprint.id);
                    return (
                      <label
                        key={sprint.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '9px 12px',
                          borderBottom: '1px solid var(--gridline)',
                          cursor: 'pointer',
                          background: checked ? 'var(--surface-1)' : 'transparent',
                        }}
                      >
                        <input type="checkbox" checked={checked} onChange={() => toggleSprint(sprint.id)} style={{ cursor: 'pointer' }} />
                        <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)' }}>{sprint.name}</span>
                        <span className="tabular-nums" style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                          {formatBr(sprint.startDate)} – {formatBr(sprint.endDate)}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  onClick={handleLoadIndicators}
                  disabled={selectedSprintIds.length === 0 || loadingData}
                  title={selectedSprintIds.length === 0 ? 'Selecione ao menos uma sprint' : undefined}
                  style={primaryButtonStyle(selectedSprintIds.length === 0 || loadingData)}
                >
                  {loadingData ? 'Carregando...' : 'Carregar indicadores'}
                </button>
                <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                  {selectedSprintIds.length === 0
                    ? 'Nenhuma sprint selecionada'
                    : `${selectedSprintIds.length} sprint${selectedSprintIds.length > 1 ? 's' : ''} selecionada${selectedSprintIds.length > 1 ? 's' : ''}`}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {dataError && <p style={{ color: 'var(--status-critical)', fontSize: 13 }}>{dataError}</p>}

      {historicalData && (
        <IndicatorsView
          activities={historicalData.activities}
          sprints={historicalData.sprints}
          today={historicalData.today}
          hoursPerPfBySprintId={hoursPerPfBySprintId}
          assumedTestSharePercent={historicalData.assumedTestSharePercent}
          sprintFilter={historicalSprintFilter}
          onSprintClick={handleHistoricalSprintClick}
        />
      )}
    </div>
  );
}

const stepLabelStyle: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 700,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: 0.3,
  margin: '0 0 8px',
};

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

const linkButtonStyle: React.CSSProperties = {
  padding: 0,
  border: 'none',
  background: 'none',
  color: 'var(--series-impl)',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  textDecoration: 'underline',
};
