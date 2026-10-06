import { useEffect, useState, type FormEvent } from 'react';
import { getConfig, saveConfig, type AppConfig } from '../api/client.js';

const VERTICAL_OPTIONS = ['Contratos', 'Contábil', 'Arrecadação', 'Saúde', 'Educação', 'ISS', 'Pessoal'];

/** Converte um valor em horas decimais (ex.: "6,4") para "6h 24min", para o usuário conferir o valor exato digitado. */
function formatHoursAsClock(rawValue: string): string | null {
  const parsed = Number(rawValue.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  let hours = Math.floor(parsed);
  let minutes = Math.round((parsed - hours) * 60);
  if (minutes === 60) {
    hours += 1;
    minutes = 0;
  }
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}min`;
}

export default function SettingsScreen({
  onSaved,
  onCancel,
}: {
  onSaved: (config: AppConfig) => void;
  /** Quando informado, mostra um botão "Fechar" que sai sem salvar — usado quando a tela é aberta
   * por cima de um board já carregado, só pra conferir algo (sem isso, só dava pra sair salvando,
   * o que disparava uma busca nova no Jira à toa). Omitido na configuração inicial, onde não há
   * pra onde "fechar" sem salvar. */
  onCancel?: () => void;
}) {
  const [vertical, setVertical] = useState('');
  const [jiraUsername, setJiraUsername] = useState('');
  const [jiraPassword, setJiraPassword] = useState('');
  const [passwordAlreadySet, setPasswordAlreadySet] = useState(false);
  const [hoursPerDay, setHoursPerDay] = useState('');
  const [dashDelayBar, setDashDelayBar] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hoursPerDayClock = formatHoursAsClock(hoursPerDay);

  useEffect(() => {
    getConfig().then((config) => {
      if (config.vertical) {
        const match = VERTICAL_OPTIONS.find((o) => o.toLowerCase() === config.vertical!.toLowerCase());
        setVertical(match ?? config.vertical);
      }
      if (config.jiraUsername) setJiraUsername(config.jiraUsername);
      setPasswordAlreadySet(config.jiraPasswordSet);
      setHoursPerDay(String(Math.round(config.hoursPerDay * 100) / 100));
      setDashDelayBar(config.dashDelayBar);
      setAutoRefreshEnabled(config.autoRefreshEnabled);
    });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmedVertical = vertical.trim();
    const trimmedUsername = jiraUsername.trim();
    const parsedHoursPerDay = Number(hoursPerDay.replace(',', '.'));
    if (!trimmedVertical || !trimmedUsername) {
      setError('Informe a vertical e o usuário do Jira.');
      return;
    }
    if (!passwordAlreadySet && !jiraPassword.trim()) {
      setError('Informe a senha do Jira.');
      return;
    }
    if (!Number.isFinite(parsedHoursPerDay) || parsedHoursPerDay <= 0) {
      setError('Informe um valor válido para horas produtivas por dia.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const config = await saveConfig({
        vertical: trimmedVertical,
        jiraUsername: trimmedUsername,
        jiraPassword,
        hoursPerDay: parsedHoursPerDay,
        dashDelayBar,
        autoRefreshEnabled,
      });
      onSaved(config);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.');
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // Com onCancel, a tela abre por cima de um board já carregado — um fundo escurecido deixa
        // claro que é uma sobreposição temporária. Na configuração inicial (sem onCancel) é a única
        // coisa na página, então usa a cor normal de fundo em vez de escurecer o nada.
        background: onCancel ? 'rgba(0, 0, 0, 0.45)' : 'var(--page-plane)',
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: 'var(--surface-1)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 32,
          width: 360,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div>
          <h1 style={{ fontSize: 18, margin: 0 }}>Configurar painel</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '6px 0 0' }}>
            Selecione a vertical do Jira que este painel deve acompanhar e informe as credenciais que serão usadas
            para consultar o Jira. As sprints ativas de cada projeto dessa vertical serão detectadas automaticamente.
          </p>
        </div>

        <Field label="Vertical">
          <select autoFocus value={vertical} onChange={(e) => setVertical(e.target.value)} style={inputStyle}>
            <option value="" disabled>
              Selecione...
            </option>
            {(VERTICAL_OPTIONS.includes(vertical) || vertical === '' ? VERTICAL_OPTIONS : [vertical, ...VERTICAL_OPTIONS]).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Usuário do Jira">
          <input
            value={jiraUsername}
            onChange={(e) => setJiraUsername(e.target.value)}
            placeholder="seu.usuario"
            autoComplete="username"
            style={inputStyle}
          />
        </Field>

        <Field label="Senha do Jira">
          <input
            type="password"
            value={jiraPassword}
            onChange={(e) => setJiraPassword(e.target.value)}
            placeholder={passwordAlreadySet ? 'Deixe em branco para manter a atual' : ''}
            autoComplete="current-password"
            style={inputStyle}
          />
        </Field>

        <Field label="Horas produtivas por dia">
          <input
            type="number"
            step="0.01"
            min="0.5"
            max="24"
            value={hoursPerDay}
            onChange={(e) => setHoursPerDay(e.target.value)}
            placeholder="8"
            style={inputStyle}
          />
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
            Quantas horas de trabalho efetivo consideramos em 1 dia útil (descontando reuniões, pausas etc)
            {hoursPerDayClock ? ` — equivale a ${hoursPerDayClock}` : ''}. Usado junto com as horas por PF de cada
            sprint (configuráveis na própria sprint, na Linha do tempo) nas previsões de prazo.
          </span>
        </Field>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
          <input
            type="checkbox"
            checked={dashDelayBar}
            onChange={(e) => setDashDelayBar(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          Tracejar barra de atraso
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
          <input
            type="checkbox"
            checked={autoRefreshEnabled}
            onChange={(e) => setAutoRefreshEnabled(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          Atualizar automaticamente a cada 5 minutos
        </label>

        {error && <p style={{ color: 'var(--status-critical)', fontSize: 13, margin: 0 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10 }}>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '10px 16px',
                borderRadius: 8,
                border: '1px solid var(--baseline)',
                background: 'var(--surface-1)',
                color: 'var(--text-secondary)',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Fechar
            </button>
          )}
          <button
            type="submit"
            disabled={saving}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--series-impl)',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: saving ? 'default' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Salvando...' : 'Salvar e continuar'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
      {label}
      {children}
    </label>
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
