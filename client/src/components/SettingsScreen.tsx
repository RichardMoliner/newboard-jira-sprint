import { useState, type FormEvent } from 'react';
import { saveConfig } from '../api/client.js';

export default function SettingsScreen({ onSaved }: { onSaved: (vertical: string) => void }) {
  const [vertical, setVertical] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = vertical.trim();
    if (!trimmed) {
      setError('Informe a vertical.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const config = await saveConfig(trimmed);
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
            Informe a vertical do Jira que este painel deve acompanhar (ex: CONTRATOS). As sprints ativas de cada
            projeto dessa vertical serão detectadas automaticamente.
          </p>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
          Vertical
          <input
            autoFocus
            value={vertical}
            onChange={(e) => setVertical(e.target.value.toUpperCase())}
            placeholder="CONTRATOS"
            style={{
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid var(--baseline)',
              background: 'var(--page-plane)',
              color: 'var(--text-primary)',
              fontSize: 14,
            }}
          />
        </label>

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
