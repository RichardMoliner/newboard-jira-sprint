import type { JiraCredentials } from '../mcp/client.js';
import { fetchIssueChangelog, type ChangelogHistory } from './fetchSprintEntry.js';

const AWAITING_CODE_REVIEW_STATUS = 'Aguardando liberação para testes';

function dateOnly(isoDateTime: string): string {
  return isoDateTime.slice(0, 10);
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * Acha a data (YYYY-MM-DD) em que a subtarefa entrou pela PRIMEIRA vez no status informado, a
 * partir do changelog do Jira. Diferente de `findDoneTransitionDate` (que pega a transição mais
 * recente), aqui usamos a primeira ocorrência de propósito: se a review foi reaberta e a subtarefa
 * voltou pro status depois, o que importa pro ciclo é quando ela entrou em code review pela
 * primeira vez. O timestamp bruto do changelog é truncado para data-only, igual todo outro sinal
 * de data do pipeline (comparações usam string compare de datas ISO, que quebra se misturar
 * timestamp com data-only).
 */
export function findStatusEnteredDate(histories: ChangelogHistory[], targetStatus: string): string | null {
  const normalizedTarget = normalize(targetStatus);
  const matches = histories
    .flatMap((h) => h.items.map((item) => ({ created: h.created, item })))
    .filter(({ item }) => item.field === 'status' && normalize(item.toString ?? '') === normalizedTarget);

  if (matches.length === 0) return null;

  matches.sort((a, b) => a.created.localeCompare(b.created));
  return dateOnly(matches[0].created);
}

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
