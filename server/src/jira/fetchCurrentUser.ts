import type { JiraCredentials } from '../mcp/client.js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente ${name} não definida. Configure o arquivo .env (veja .env.example).`);
  }
  return value;
}

/**
 * Busca o nome de exibição (displayName) do usuário autenticado no Jira — usado pro filtro "Minhas
 * tarefas" da Linha do tempo, que compara contra `Activity.developer` (também um displayName, não
 * o username de login). Falha ao buscar (Jira fora do ar, credenciais inválidas) não derruba o
 * board inteiro: cai pra `null`, e o filtro fica indisponível no client.
 */
export async function fetchCurrentUserDisplayName(credentials: JiraCredentials): Promise<string | null> {
  const baseUrl = requireEnv('JIRA_BASE_URL').replace(/\/$/, '');
  const auth = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
  try {
    const res = await fetch(`${baseUrl}/rest/api/2/myself`, {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`Jira retornou ${res.status} ao buscar o usuário autenticado`);
    }
    const data = (await res.json()) as { displayName?: string };
    return data.displayName ?? null;
  } catch (err) {
    console.error('[fetchCurrentUser] Falha ao buscar o displayName do usuário autenticado:', err instanceof Error ? err.message : err);
    return null;
  }
}
