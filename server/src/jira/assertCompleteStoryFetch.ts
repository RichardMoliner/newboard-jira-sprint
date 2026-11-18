/**
 * Garante que toda story encontrada na busca (`storyHits`) teve seu `get_issue` resolvido com
 * sucesso (`storyDetails` sem `null` na mesma posição). Lançar aqui em vez de seguir com um
 * resultado parcial é o que impede `fetchClosedSprintsData` de persistir — pra sempre, já que
 * sprint fechada nunca invalida cache (ver `sprintCache.ts`) — um snapshot faltando atividades por
 * causa de uma falha transitória (timeout do MCP, etc.) numa fração das chamadas.
 */
export function assertCompleteStoryFetch(
  storyHits: { key: string }[],
  storyDetails: ({ key: string } | null)[],
): void {
  const failedKeys = storyHits.filter((_, i) => storyDetails[i] === null).map((hit) => hit.key);
  if (failedKeys.length === 0) return;

  throw new Error(
    `Falha ao buscar ${failedKeys.length} de ${storyHits.length} stories: ${failedKeys.join(', ')}. ` +
      'Abortando para não gravar um cache incompleto.',
  );
}
