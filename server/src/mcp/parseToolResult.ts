function extractText(result: unknown): string | null {
  if (typeof result !== 'object' || result === null || !('content' in result)) return null;
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return null;
  const block = content.find(
    (item): item is { type: 'text'; text: string } =>
      typeof item === 'object' && item !== null && (item as { type?: unknown }).type === 'text',
  );
  return block?.text ?? null;
}

function isError(result: unknown): boolean {
  return typeof result === 'object' && result !== null && (result as { isError?: unknown }).isError === true;
}

/** Extrai e faz o parse do JSON retornado por uma tool call MCP, lançando erro em caso de falha. */
export function parseToolResult<T = unknown>(result: unknown): T {
  const text = extractText(result);

  if (isError(result)) {
    throw new Error(text ?? 'A ferramenta MCP reportou um erro sem detalhes');
  }

  if (text === null) {
    throw new Error('Resposta inesperada da ferramenta MCP: nenhum conteúdo de texto encontrado');
  }

  return JSON.parse(text) as T;
}
