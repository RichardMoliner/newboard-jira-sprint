import { useEffect, useMemo, useRef, useState } from 'react';
import { getConfig, getSprintSettings, saveSprintSettings } from '../api/client.js';
import { useBoardData } from '../api/useBoardData.js';
import { applyGroupSelection, computeGroupClickFilter, computeInitialSprintFilter } from '../sprintGrouping.js';
import type { SprintSettings } from '../types.js';
import type { Theme } from '../App.js';
import TimelineView from './TimelineView.js';
import IndicatorsView from './IndicatorsView.js';
import HistoryView from './HistoryView.js';
import ReportView from './ReportView.js';
import ProgressModal from './ProgressModal.js';
import SettingsScreen from './SettingsScreen.js';
import AdminScreen from './AdminScreen.js';

type Tab = 'timeline' | 'indicators' | 'history';

export default function BoardScreen({
  vertical,
  onVerticalChange,
  theme,
  onToggleTheme,
}: {
  vertical: string;
  onVerticalChange: (vertical: string) => void;
  theme: Theme;
  onToggleTheme: () => void;
}) {
  const [tab, setTab] = useState<Tab>('timeline');
  const [showReport, setShowReport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [sprintFilter, setSprintFilter] = useState<string[]>([]);
  const [dashDelayBar, setDashDelayBar] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  // Configuração por sprint (horas/PF e prazos) — sem fallback global: uma sprint sem entrada aqui
  // usa o padrão do sistema pra horas/PF (ver hoursPerPfBySprintId) e não tem régua de prazo.
  const [sprintSettingsById, setSprintSettingsById] = useState<Record<string, SprintSettings>>({});
  const [sprintSettingsLoaded, setSprintSettingsLoaded] = useState(false);
  const appliedInitialSprintFilter = useRef(false);
  const { data, loading, error, refresh, recomputeSprintEstimates, secondsToNextRefresh, progressMessages } =
    useBoardData(autoRefreshEnabled);

  useEffect(() => {
    getConfig().then((config) => {
      setDashDelayBar(config.dashDelayBar);
      setAutoRefreshEnabled(config.autoRefreshEnabled);
    });
    getSprintSettings().then((settings) => {
      setSprintSettingsById(settings);
      setSprintSettingsLoaded(true);
    });
  }, []);

  // Aplica a marcação persistida dos agrupadores como filtro inicial ao carregar o painel — só uma
  // vez (não deve sobrescrever a navegação do usuário nos refreshes/polling seguintes).
  useEffect(() => {
    if (appliedInitialSprintFilter.current || !data || !sprintSettingsLoaded) return;
    appliedInitialSprintFilter.current = true;
    setSprintFilter(computeInitialSprintFilter(data.sprints, sprintSettingsById));
  }, [data, sprintSettingsLoaded, sprintSettingsById]);

  const hoursPerPfBySprintId = useMemo(() => {
    if (!data) return {};
    return Object.fromEntries(data.sprints.map((s) => [s.id, sprintSettingsById[s.id]?.hoursPerPf ?? data.defaultHoursPerPf]));
  }, [data, sprintSettingsById]);

  // Chamado pelo pop-up de configuração da sprint (ícone de engrenagem na pill, Linha do tempo) após
  // salvar — atualiza a régua de prazo na hora e recalcula localmente as estimativas da sprint
  // (horas/PF pode ter mudado), sem buscar os dados de novo no Jira.
  function handleSprintSettingsSaved(sprintId: string, settings: SprintSettings) {
    setSprintSettingsById((prev) => ({ ...prev, [sprintId]: settings }));
    if (!data) return;
    const hoursPerPf = settings.hoursPerPf ?? data.defaultHoursPerPf;
    const hoursPerDay = settings.hoursPerDay ?? data.hoursPerDay;
    recomputeSprintEstimates(sprintId, hoursPerPf, hoursPerDay);
  }

  // Clique normal seleciona só aquela sprint; shift+clique soma/remove da seleção atual,
  // permitindo combinar várias sprints no filtro. Efêmero — não persiste, ao contrário do
  // popover do agrupador (ver handleGroupSelectionChange).
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

  // Clique na pill do agrupador (fora da seta) — filtro efêmero igual ao clique numa pill de sprint
  // individual, não persiste (ver handleGroupSelectionChange pro popover, que persiste).
  function handleGroupClick(sprintIds: string[], shiftKey: boolean) {
    if (!data) return;
    setSprintFilter((prev) => computeGroupClickFilter(data.sprints.map((s) => s.id), prev, sprintIds, shiftKey));
  }

  // Chamado pelo popover do agrupador (checkbox individual ou "Marcar/Desmarcar todas") — atualiza
  // o filtro na hora e persiste a marcação de cada sprint envolvida, pra voltar marcada assim no
  // próximo carregamento do painel.
  function handleGroupSelectionChange(sprintIds: string[], checked: boolean) {
    if (!data) return;
    setSprintFilter((prev) => applyGroupSelection(data.sprints.map((s) => s.id), prev, sprintIds, checked));
    for (const sprintId of sprintIds) {
      const existing = sprintSettingsById[sprintId];
      if (!existing) continue;
      const next = { ...existing, includedInGroupFilter: checked };
      setSprintSettingsById((prev) => ({ ...prev, [sprintId]: next }));
      saveSprintSettings(sprintId, next);
    }
  }

  return (
    <div className="board-root" style={{ height: '100vh', boxSizing: 'border-box', padding: '24px 32px 0', display: 'flex', flexDirection: 'column' }}>
      {loading && <ProgressModal messages={progressMessages} />}
      {showSettings && (
        <SettingsScreen
          onCancel={() => setShowSettings(false)}
          onSaved={(config) => {
            setShowSettings(false);
            setDashDelayBar(config.dashDelayBar);
            setAutoRefreshEnabled(config.autoRefreshEnabled);
            if (config.vertical && config.vertical !== vertical) onVerticalChange(config.vertical);
            refresh();
          }}
        />
      )}
      {showAdmin && <AdminScreen onCancel={() => setShowAdmin(false)} />}
      <header
        className="no-print"
        style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexShrink: 0 }}
      >
        <h1 style={{ fontSize: 20, margin: 0 }}>Painel de acompanhamento — {vertical}</h1>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onToggleTheme}
              title={theme === 'dark' ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
              aria-label="Alternar tema claro/escuro"
              style={{ ...secondaryButtonStyle, padding: '8px 10px', fontSize: 15, lineHeight: 1 }}
            >
              {theme === 'dark' ? '🌙' : '☀️'}
            </button>
            <button onClick={() => setShowSettings(true)} style={secondaryButtonStyle}>
              Configurações
            </button>
            <button onClick={() => setShowAdmin(true)} style={secondaryButtonStyle}>
              Admin
            </button>
            {data && (
              <button onClick={() => setShowReport(true)} style={secondaryButtonStyle}>
                Gerar relatório
              </button>
            )}
            <button onClick={refresh} disabled={loading} style={primaryButtonStyle(loading)}>
              {loading ? 'Atualizando...' : 'Atualizar'}
            </button>
          </div>
          <p className="tabular-nums" style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0 }}>
            {data ? (
              <>
                Atualizado às {formatTime(data.generatedAt)}
                {!loading && (autoRefreshEnabled ? ` · Próxima em ${formatCountdown(secondsToNextRefresh)}` : ' · Auto-atualização desligada')}
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
            flexShrink: 0,
          }}
        >
          {error}
        </div>
      )}

      {!data && loading && <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Carregando painel...</p>}

      {data && showReport && (
        <div className="report-scroll" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <ReportView
            activities={data.activities}
            sprints={data.sprints}
            today={data.today}
            sprintFilter={sprintFilter}
            onSprintClick={handleSprintClick}
            hoursPerPfBySprintId={hoursPerPfBySprintId}
            assumedTestSharePercent={data.assumedTestSharePercent}
            vertical={vertical}
            onClose={() => setShowReport(false)}
          />
        </div>
      )}

      {data && !showReport && (
        <>
          <nav style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--gridline)', marginBottom: 20, flexShrink: 0 }}>
            <TabButton active={tab === 'timeline'} onClick={() => setTab('timeline')} label="Linha do tempo" />
            <TabButton active={tab === 'indicators'} onClick={() => setTab('indicators')} label="Indicadores" />
            <TabButton active={tab === 'history'} onClick={() => setTab('history')} label="Histórico" />
          </nav>

          {
            // As três abas ficam sempre montadas (só escondidas com display:none) em vez de
            // alternar via render condicional — isso preserva o estado interno de cada uma (ex.:
            // sprints/indicadores já carregados no Histórico) ao trocar de aba e voltar.
          }
          <div style={{ display: tab === 'history' ? undefined : 'none', paddingBottom: 60, overflow: 'auto' }}>
            <HistoryView sprintSettingsById={sprintSettingsById} />
          </div>
          {/* Só a timeline ganha altura contida com scroll próprio (cabeçalho fixo dentro dela) —
              os Indicadores continuam no fluxo normal, a página inteira rola como antes. */}
          <div style={{ display: tab === 'timeline' ? 'flex' : 'none', flex: 1, minHeight: 0, paddingBottom: 24 }}>
            <TimelineView
              activities={data.activities}
              sprints={data.sprints}
              today={data.today}
              hoursPerDay={data.hoursPerDay}
              sprintFilter={sprintFilter}
              onSprintClick={handleSprintClick}
              dashDelayBar={dashDelayBar}
              sprintSettingsById={sprintSettingsById}
              onSprintSettingsSaved={handleSprintSettingsSaved}
              onGroupSelectionChange={handleGroupSelectionChange}
              onGroupClick={handleGroupClick}
              currentUserDisplayName={data.currentUserDisplayName}
            />
          </div>
          <div style={{ display: tab === 'indicators' ? undefined : 'none', paddingBottom: 60, overflow: 'auto' }}>
            <IndicatorsView
              activities={data.activities}
              sprints={data.sprints}
              today={data.today}
              hoursPerPfBySprintId={hoursPerPfBySprintId}
              assumedTestSharePercent={data.assumedTestSharePercent}
              sprintFilter={sprintFilter}
              onSprintClick={handleSprintClick}
              sprintSettingsById={sprintSettingsById}
              onGroupSelectionChange={handleGroupSelectionChange}
              onGroupClick={handleGroupClick}
            />
          </div>
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
