export default function ProgressModal({ messages }: { messages: string[] }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: 'var(--surface-1)',
          border: '1px solid var(--baseline)',
          borderRadius: 10,
          padding: '20px 24px',
          minWidth: 320,
          maxWidth: 420,
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <img src="/loading_B.gif" alt="" width={28} height={28} />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Buscando dados do Jira...</span>
        </div>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {messages.map((message, i) => {
            // Uma etapa é considerada concluída quando uma etapa mais nova já começou depois dela
            // (ou quando ela própria é a etapa final "Concluído.").
            const done = i < messages.length - 1 || message === 'Concluído.';
            return (
              <li
                key={i}
                style={{
                  fontSize: 12.5,
                  color: done ? 'var(--text-muted)' : 'var(--text-primary)',
                }}
              >
                {done && <span style={{ color: 'var(--status-good)', marginRight: 5 }}>✓</span>}
                {message}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
