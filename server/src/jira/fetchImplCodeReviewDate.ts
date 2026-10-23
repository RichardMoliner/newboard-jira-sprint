import type { JiraCredentials } from '../mcp/client.js';
import { fetchIssueChangelog, findStatusEnteredDate } from './fetchSprintEntry.js';

const AWAITING_CODE_REVIEW_STATUS = 'Aguardando liberação para testes';

interface CacheEntry {
  updated: string;
  enteredAt: string | null;
}

// Cache em memória (nível de módulo, sobrevive entre requisições mas não a restarts) — evita
// rebuscar o changelog quando a subtarefa não mudou desde a última vez (mesmo `updated`).
const cache = new Map<string, CacheEntry>();

/**
 * Busca o changelog da subtarefa e extrai dele quando ela entrou pela primeira vez em "Aguardando
 * liberação para testes" (ou seja, quando a Implementação entrou em code review). Busca só quando
 * necessário: se o `updated` da subtarefa não mudou desde a última chamada, reaproveita o cache
 * (nenhuma chamada extra ao Jira). Falha ao buscar o changelog não derruba o board inteiro — cai
 * pra `null` e loga o erro.
 */
export async function getImplCodeReviewEnteredAt(
  subtaskKey: string,
  updated: string,
  credentials: JiraCredentials,
): Promise<string | null> {
  const cached = cache.get(subtaskKey);
  if (cached && cached.updated === updated) {
    return cached.enteredAt;
  }

  let enteredAt: string | null;
  try {
    const histories = await fetchIssueChangelog(subtaskKey, credentials);
    enteredAt = findStatusEnteredDate(histories, AWAITING_CODE_REVIEW_STATUS);
  } catch (err) {
    console.error(
      `[fetchImplCodeReviewDate] Falha ao buscar changelog de ${subtaskKey}, ignorando:`,
      err instanceof Error ? err.message : err,
    );
    enteredAt = null;
  }

  cache.set(subtaskKey, { updated, enteredAt });
  return enteredAt;
}

/**
 * Agrega as datas de entrada em code review de múltiplas subtarefas de Implementação: usa a mais
 * tardia entre as que de fato chegaram no status (comparação de string serve — datas ISO ordenam
 * lexicograficamente igual), ou `null` se nenhuma chegou.
 */
export function latestOrNull(dates: (string | null)[]): string | null {
  const nonNull = dates.filter((d): d is string => d !== null);
  if (nonNull.length === 0) return null;
  return nonNull.reduce((latest, current) => (current > latest ? current : latest));
}
