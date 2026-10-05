export interface ParsedSprint {
  id: string;
  name: string;
  state: string;
  /** Data de início da sprint, no formato YYYY-MM-DD. */
  startDate: string;
  /** Data de término da sprint, no formato YYYY-MM-DD. */
  endDate: string;
  /** Timestamp ISO completo de início/fim, como veio do Jira — precisão de hora. */
  startDateTime: string;
  endDateTime: string;
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

  // Uma sprint fechada costuma fechar de fato um pouco depois do endDate planejado (completeDate
  // registra esse fechamento real, geralmente horas depois — às vezes já no dia seguinte). Usar
  // completeDate quando presente evita cortar o burndown/cálculos históricos antes do fim real da
  // sprint. Sprints ainda não fechadas vêm com completeDate=<null> (literal, do toString() do
  // greenhopper) — nesse caso mantém o endDate planejado.
  const completeDate = attrs.completeDate && attrs.completeDate !== '<null>' ? attrs.completeDate : undefined;
  const endDateTime = completeDate ?? attrs.endDate ?? attrs.startDate;

  return {
    id: attrs.id,
    name: attrs.name,
    state: attrs.state ?? 'UNKNOWN',
    startDate: attrs.startDate.slice(0, 10),
    endDate: endDateTime.slice(0, 10),
    startDateTime: attrs.startDate,
    endDateTime,
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

  const parsed = parseAllSprintFields(raw);
  if (parsed.length === 0) return null;

  return parsed.find((s) => s.state === 'ACTIVE') ?? parsed[parsed.length - 1];
}

/**
 * Faz o parse de TODAS as sprints do campo raw, sem escolher uma só — usado na descoberta de
 * sprints fechadas (aba Histórico), onde uma issue pode ter passado por várias sprints ao longo do
 * tempo e queremos conhecer cada uma, não só a mais relevante pro estado atual da issue.
 */
export function parseAllSprintFields(raw: string[] | undefined): ParsedSprint[] {
  if (!raw || raw.length === 0) return [];
  return raw.map(toParsedSprint).filter((s): s is ParsedSprint => s !== null);
}
