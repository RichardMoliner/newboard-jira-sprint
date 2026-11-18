/** Círculo com a foto da pessoa (quando `avatarUrl` veio do Jira) ou, sem foto/pessoa não
 * encontrada, as iniciais do nome sobre uma cor sólida derivada de um hash simples do nome —
 * determinístico, então a mesma pessoa sempre cai na mesma cor entre renders. */
export function PersonAvatar({ name, avatarUrl, size = 18 }: { name: string; avatarUrl: string | null | undefined; size?: number }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        width={size}
        height={size}
        style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: `hsl(${hue}, 40%, 38%)`,
        color: '#fff',
        fontSize: size * 0.42,
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {initials}
    </span>
  );
}

/** Avatar + nome, com o nome truncado (reticências) quando não cabe — usado em toda lista de
 * pessoas dos Indicadores pra manter o mesmo padrão visual. */
export function PersonLabel({ name, avatarUrl }: { name: string; avatarUrl: string | null | undefined }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', color: 'var(--text-secondary)' }}>
      <PersonAvatar name={name} avatarUrl={avatarUrl} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
    </span>
  );
}

/** Grupo de avatares sobrepostos (estilo "quem está na call") — um por pessoa de `names`, cada um
 * com tooltip do próprio nome no hover. Usado pra mostrar todo mundo que apontou hora numa
 * subtarefa (Implementação/Teste), não só o dev/tester "titular" da atividade. */
export function AvatarStack({
  names,
  avatarUrlByPerson,
  size = 14,
}: {
  names: string[];
  avatarUrlByPerson: Record<string, string | null>;
  size?: number;
}) {
  if (names.length === 0) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
      {names.map((name, i) => (
        <span
          key={name}
          title={name}
          style={{
            marginLeft: i === 0 ? 0 : -size * 0.35,
            borderRadius: '50%',
            border: '1.5px solid var(--surface-1)',
            display: 'flex',
            lineHeight: 0,
          }}
        >
          <PersonAvatar name={name} avatarUrl={avatarUrlByPerson[name]} size={size} />
        </span>
      ))}
    </span>
  );
}
