export interface ParsedSprint {
  id: string;
  name: string;
  state: string;
  /** Data de início da sprint, no formato YYYY-MM-DD. */
  startDate: string;
  /** Data de término da sprint, no formato YYYY-MM-DD. */
  endDate: string;
}

const SPRINT_ATTR_PATTERN = /\[(.+)\]$/;
const ATTR_KEY_PATTERN = /(?:^|,)([a-zA-Z]+)=/g;

/**
 * Faz o parse de "chave=valor" separados por vírgula, sem quebrar quando um
 * valor (ex: o nome da sprint) contém vírgulas — só trata "," como separador
 * quando ela é imediatamente seguida por outra "chave=" reconhecida.
 */
function parseAttributes(raw: string): Record<string, string> {
  const outer = raw.match(SPRINT_ATTR_PATTERN);
  if (!outer) return {};
  const inner = outer[1];

  const matches = [...inner.matchAll(ATTR_KEY_PATTERN)];
  const attrs: Record<string, string> = {};

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const key = match[1];
    const valueStart = match.index + match[0].length;
    const valueEnd = i + 1 < matches.length ? matches[i + 1].index : inner.length;
    attrs[key] = inner.slice(valueStart, valueEnd);
  }

  return attrs;
}

function toParsedSprint(raw: string): ParsedSprint | null {
  const attrs = parseAttributes(raw);
  if (!attrs.id || !attrs.name || !attrs.startDate) return null;
  return {
    id: attrs.id,
    name: attrs.name,
    state: attrs.state ?? 'UNKNOWN',
    startDate: attrs.startDate.slice(0, 10),
    endDate: attrs.endDate ? attrs.endDate.slice(0, 10) : attrs.startDate.slice(0, 10),
  };
}

/**
 * Faz o parse do campo raw "Sprint" (customfield_10001) do Jira, um array de
 * strings no formato toString() do greenhopper Sprint. Quando a issue tem
 * histórico de mais de uma sprint, prioriza a que está ACTIVE; caso nenhuma
 * esteja ativa, usa a última do array.
 */
export function parseSprintField(raw: string[] | undefined): ParsedSprint | null {
  if (!raw || raw.length === 0) return null;

  const parsed = raw.map(toParsedSprint).filter((s): s is ParsedSprint => s !== null);
  if (parsed.length === 0) return null;

  return parsed.find((s) => s.state === 'ACTIVE') ?? parsed[parsed.length - 1];
}
