import { mapWithConcurrency } from './mapWithConcurrency.js';

const CONCURRENCY = 6;

interface JiraUserSearchHit {
  avatarUrls?: Record<string, string>;
}

/**
 * Busca o avatar (48x48) de cada nome ainda não presente em `cached`, já baixado e convertido pra
 * `data:` URI (via `downloadAvatar`) — NÃO guarda a URL crua do Jira. `/secure/useravatar` exige a
 * sessão autenticada do Jira; o navegador bloqueia o cookie de terceiro num `<img src>` embutido
 * cross-origin (localhost:5173 ↔ desenv.betha.com.br), então o Jira respondia com o avatar padrão
 * genérico pra todo mundo (200 OK, mas sempre a mesma imagem) em vez da foto real — só funcionava
 * navegando direto pra URL (contexto de primeira parte). Baixar no servidor, que já usa as mesmas
 * credenciais pra tudo mais, e embutir os bytes como `data:` URI elimina essa dependência de cookie
 * no client.
 *
 * Avatar de uma pessoa não muda por sprint, então nomes já conhecidos (mesmo com valor `null`, de
 * uma busca ou download anterior sem sucesso) não são buscados de novo. Uma falha pontual (timeout
 * na busca, autenticação expirada no download, etc.) não derruba as demais — registra `null` pra
 * essa pessoa. Retorna o cache completo (entradas antigas preservadas + as novas), pronto pra
 * persistir de volta.
 */
export async function fetchAvatarUrls(
  names: string[],
  cached: Record<string, string | null>,
  searchUser: (name: string) => Promise<JiraUserSearchHit[]>,
  downloadAvatar: (url: string) => Promise<string>,
): Promise<Record<string, string | null>> {
  const missing = [...new Set(names)].filter((name) => !(name in cached));
  if (missing.length === 0) return cached;

  const freshPairs = await mapWithConcurrency(missing, CONCURRENCY, async (name) => {
    try {
      const hits = await searchUser(name);
      const avatarUrl = hits[0]?.avatarUrls?.['48x48'];
      if (!avatarUrl) return [name, null] as const;
      return [name, await downloadAvatar(avatarUrl)] as const;
    } catch {
      return [name, null] as const;
    }
  });

  return { ...cached, ...Object.fromEntries(freshPairs) };
}
