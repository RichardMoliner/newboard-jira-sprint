import { useEffect, useState } from 'react';
import { getConfig } from './api/client.js';
import SettingsScreen from './components/SettingsScreen.js';
import BoardScreen from './components/BoardScreen.js';

type AppState =
  | { status: 'loading' }
  | { status: 'needs-setup' }
  | { status: 'ready'; vertical: string }
  | { status: 'error'; message: string };

export default function App() {
  const [state, setState] = useState<AppState>({ status: 'loading' });

  useEffect(() => {
    getConfig()
      .then((config) => {
        const isComplete = config.vertical && config.jiraUsername && config.jiraPasswordSet;
        setState(isComplete ? { status: 'ready', vertical: config.vertical! } : { status: 'needs-setup' });
      })
      .catch((err) => setState({ status: 'error', message: err.message }));
  }, []);

  if (state.status === 'loading') {
    return <CenteredMessage text="Carregando..." />;
  }

  if (state.status === 'error') {
    return <CenteredMessage text={`Erro ao carregar configuração: ${state.message}`} isError />;
  }

  if (state.status === 'needs-setup') {
    return <SettingsScreen onSaved={(vertical) => setState({ status: 'ready', vertical })} />;
  }

  return (
    <BoardScreen
      vertical={state.vertical}
      onChangeVertical={() => setState({ status: 'needs-setup' })}
    />
  );
}

function CenteredMessage({ text, isError }: { text: string; isError?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        color: isError ? 'var(--status-critical)' : 'var(--text-secondary)',
        fontSize: 14,
      }}
    >
      {text}
    </div>
  );
}
