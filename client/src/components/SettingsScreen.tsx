import { useEffect, useState, type FormEvent } from 'react';
import { getConfig, saveConfig } from '../api/client.js';

const VERTICAL_OPTIONS = ['Contratos', 'Contábil', 'Arrecadação', 'Saúde', 'Educação', 'ISS'];

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

export default function SettingsScreen({ onSaved }: { onSaved: (vertical: string) => void }) {
  const [vertical, setVertical] = useState('');
  const [jiraUsername, setJiraUsername] = useState('');
  const [jiraPassword, setJiraPassword] = useState('');
  const [passwordAlreadySet, setPasswordAlreadySet] = useState(false);
  const [hoursPerPf, setHoursPerPf] = useState('');
  const [hoursPerDay, setHoursPerDay] = useState('');
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
      setHoursPerPf(String(Math.round(config.hoursPerPf * 100) / 100));
      setHoursPerDay(String(Math.round(config.hoursPerDay * 100) / 100));
    });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmedVertical = vertical.trim();
    const trimmedUsername = jiraUsername.trim();
    const parsedHoursPerPf = Number(hoursPerPf.replace(',', '.'));
    const parsedHoursPerDay = Number(hoursPerDay.replace(',', '.'));
    if (!trimmedVertical || !trimmedUsername) {
      setError('Informe a vertical e o usuário do Jira.');
      return;
    }
    if (!passwordAlreadySet && !jiraPassword.trim()) {
      setError('Informe a senha do Jira.');
      return;
    }
    if (!Number.isFinite(parsedHoursPerPf) || parsedHoursPerPf <= 0) {
      setError('Informe um valor válido para horas por PF.');
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
        hoursPerPf: parsedHoursPerPf,
        hoursPerDay: parsedHoursPerDay,
      });
      onSaved(config.vertical!);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.');
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
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

        <Field label="Horas por PF">
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={hoursPerPf}
            onChange={(e) => setHoursPerPf(e.target.value)}
            placeholder="5.71"
            style={inputStyle}
          />
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
            Produtividade da vertical: quantas horas de trabalho equivalem a 1 Ponto de Função. Usado para projetar os
            prazos de implementação e teste.
          </span>
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
            {hoursPerDayClock ? ` — equivale a ${hoursPerDayClock}` : ''}. Usado junto com as horas por PF nas
            previsões de prazo.
          </span>
        </Field>

        {error && <p style={{ color: 'var(--status-critical)', fontSize: 13, margin: 0 }}>{error}</p>}

        <button
          type="submit"
          disabled={saving}
          style={{
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
