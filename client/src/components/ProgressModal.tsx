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
          <Spinner />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Buscando dados do Jira...</span>
        </div>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {messages.map((message, i) => (
            <li
              key={i}
              style={{
                fontSize: 12.5,
                color: i === messages.length - 1 ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
            >
              {message}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <>
      <span
        style={{
          display: 'inline-block',
          width: 14,
          height: 14,
          border: '2px solid var(--gridline)',
          borderTopColor: 'var(--series-impl)',
          borderRadius: '50%',
          animation: 'progress-modal-spin 0.8s linear infinite',
        }}
      />
      <style>{`
        @keyframes progress-modal-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
