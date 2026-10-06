import { useState, type FormEvent } from 'react';
import { saveSprintSettings } from '../api/client.js';
import type { SprintInfo, SprintSettings } from '../types.js';

export default function SprintSettingsPopup({
  sprint,
  settings,
  onClose,
  onSaved,
}: {
  sprint: SprintInfo;
  /** Configuração já salva pra essa sprint, se houver — undefined/campos null viram inputs vazios. */
  settings: SprintSettings | undefined;
  onClose: () => void;
  onSaved: (sprintId: string, settings: SprintSettings) => void;
}) {
  const [hoursPerPf, setHoursPerPf] = useState(settings?.hoursPerPf != null ? String(settings.hoursPerPf) : '');
  const [lastPublishDay, setLastPublishDay] = useState(settings?.lastPublishDay ?? '');
  const [lastTestDay, setLastTestDay] = useState(settings?.lastTestDay ?? '');
  const [publishDay, setPublishDay] = useState(settings?.publishDay ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmedHoursPerPf = hoursPerPf.trim();
    const parsedHoursPerPf = trimmedHoursPerPf ? Number(trimmedHoursPerPf.replace(',', '.')) : null;
    if (trimmedHoursPerPf && (!Number.isFinite(parsedHoursPerPf) || (parsedHoursPerPf ?? 0) <= 0)) {
      setError('Informe um valor válido para horas por PF, ou deixe em branco para usar o padrão do sistema.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const saved = await saveSprintSettings(sprint.id, {
        hoursPerPf: parsedHoursPerPf,
        lastPublishDay: lastPublishDay || null,
        lastTestDay: lastTestDay || null,
        publishDay: publishDay || null,
      });
      onSaved(sprint.id, saved);
      onClose();
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
        background: 'rgba(0, 0, 0, 0.45)',
      }}
    >
      <form
        onSubmit={handleSubmit}
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
          <h2 style={{ fontSize: 16, margin: 0 }}>Configurar sprint</h2>
          <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '4px 0 0' }}>{sprint.name}</p>
        </div>

        <Field label="Horas por PF">
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={hoursPerPf}
            onChange={(e) => setHoursPerPf(e.target.value)}
            placeholder="Padrão do sistema"
            style={inputStyle}
          />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Em branco usa o padrão do sistema. Afeta as previsões de prazo e os indicadores desta sprint.
          </span>
        </Field>

        <Field label="Último dia implementação">
          <input type="date" value={lastPublishDay} onChange={(e) => setLastPublishDay(e.target.value)} style={inputStyle} />
        </Field>

        <Field label="Último dia de testes">
          <input type="date" value={lastTestDay} onChange={(e) => setLastTestDay(e.target.value)} style={inputStyle} />
        </Field>

        <Field label="Dia da publicação">
          <input type="date" value={publishDay} onChange={(e) => setPublishDay(e.target.value)} style={inputStyle} />
        </Field>

        {error && <p style={{ color: 'var(--status-critical)', fontSize: 13, margin: 0 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
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
          <button
            type="submit"
            disabled={saving}
            style={{
              flex: 1,
              padding: '9px 16px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--series-impl)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: saving ? 'default' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: 'var(--text-secondary)' }}>
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
