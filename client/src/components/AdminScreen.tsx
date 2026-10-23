import { useState, type FormEvent } from 'react';
import { getAdminWebhooks, saveAdminWebhooks, verifyAdminPassword } from '../api/client.js';

/**
 * Tela de admin para cadastrar os webhooks do Google Chat usados nas notificações de liberação
 * antecipada. Dois estágios: (1) senha de admin (validada no servidor via `/admin/verify`, não há
 * sessão persistida — a senha digitada é reenviada em cada chamada seguinte via header
 * `x-admin-password`); (2) formulário com os dois webhooks, carregado/salvo via `/admin/webhooks`.
 */
export default function AdminScreen({ onCancel }: { onCancel: () => void }) {
  const [password, setPassword] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const [aplicacao, setAplicacao] = useState('');
  const [extensao, setExtensao] = useState('');
  const [aplicacaoSet, setAplicacaoSet] = useState(false);
  const [extensaoSet, setExtensaoSet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    setVerifying(true);
    setVerifyError(null);
    try {
      await verifyAdminPassword(password);
      // Só muda para o estágio 2 depois que o status dos webhooks também carregar — senão, se essa
      // segunda chamada falhar (rede etc), o componente já teria trocado pra tela do formulário, que
      // não exibe `verifyError`, deixando o usuário com um formulário "quebrado" sem nenhum erro visível.
      const status = await getAdminWebhooks(password);
      setAplicacaoSet(status.aplicacaoSet);
      setExtensaoSet(status.extensaoSet);
      setAuthorized(true);
    } catch {
      setVerifyError('Senha incorreta.');
    } finally {
      setVerifying(false);
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      // Só inclui no payload os campos que o usuário de fato preencheu — campo em branco deve
      // significar "manter o atual" (é isso que o placeholder promete), e o servidor interpreta
      // ausência de chave como "manter" e string vazia como "limpar" (ver server/src/routes/admin.ts).
      const payload: { aplicacao?: string; extensao?: string } = {};
      if (aplicacao.trim()) payload.aplicacao = aplicacao;
      if (extensao.trim()) payload.extensao = extensao;
      const status = await saveAdminWebhooks(password, payload);
      setAplicacaoSet(status.aplicacaoSet);
      setExtensaoSet(status.extensaoSet);
      setAplicacao('');
      setExtensao('');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Erro ao salvar.');
    } finally {
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
      {!authorized ? (
        <form
          onSubmit={handleVerify}
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
            <h1 style={{ fontSize: 18, margin: 0 }}>Admin</h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '6px 0 0' }}>
              Informe a senha de admin para configurar os webhooks de notificação do Google Chat.
            </p>
          </div>

          <Field label="Senha">
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              style={inputStyle}
            />
          </Field>

          {verifyError && <p style={{ color: 'var(--status-critical)', fontSize: 13, margin: 0 }}>{verifyError}</p>}

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={onCancel} style={secondaryButtonStyle}>
              Fechar
            </button>
            <button type="submit" disabled={verifying} style={primaryButtonStyle(verifying)}>
              {verifying ? 'Verificando...' : 'Entrar'}
            </button>
          </div>
        </form>
      ) : (
        <form
          onSubmit={handleSave}
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
            <h1 style={{ fontSize: 18, margin: 0 }}>Webhooks de liberação antecipada</h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '6px 0 0' }}>
              URLs do Google Chat usadas para avisar sobre liberações antecipadas.
            </p>
          </div>

          <Field label="Webhook de Aplicação">
            <input
              value={aplicacao}
              onChange={(e) => setAplicacao(e.target.value)}
              placeholder={aplicacaoSet ? 'Deixe em branco para manter o atual' : ''}
              style={inputStyle}
            />
          </Field>

          <Field label="Webhook de Extensão">
            <input
              value={extensao}
              onChange={(e) => setExtensao(e.target.value)}
              placeholder={extensaoSet ? 'Deixe em branco para manter o atual' : ''}
              style={inputStyle}
            />
          </Field>

          {saveError && <p style={{ color: 'var(--status-critical)', fontSize: 13, margin: 0 }}>{saveError}</p>}

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={onCancel} style={secondaryButtonStyle}>
              Fechar
            </button>
            <button type="submit" disabled={saving} style={primaryButtonStyle(saving)}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      )}
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

const primaryButtonStyle = (disabled: boolean): React.CSSProperties => ({
  flex: 1,
  padding: '10px 16px',
  borderRadius: 8,
  border: 'none',
  background: 'var(--series-impl)',
  color: '#fff',
  fontSize: 14,
  fontWeight: 600,
  cursor: disabled ? 'default' : 'pointer',
  opacity: disabled ? 0.7 : 1,
});

const secondaryButtonStyle: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: 8,
  border: '1px solid var(--baseline)',
  background: 'var(--surface-1)',
  color: 'var(--text-secondary)',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};
