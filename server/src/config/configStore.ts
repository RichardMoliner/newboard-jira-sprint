import { readFile, writeFile } from 'node:fs/promises';

export interface SprintSettings {
  /** Horas de trabalho por Ponto de Função nesta sprint. Nulo usa o padrão do sistema. */
  hoursPerPf: number | null;
  /** Data (YYYY-MM-DD) do último dia de publicação desta sprint. Nulo = não configurado, régua não aparece. */
  lastPublishDay: string | null;
  /** Data (YYYY-MM-DD) do último dia de testes desta sprint. Nulo = não configurado, régua não aparece. */
  lastTestDay: string | null;
  /** Data (YYYY-MM-DD) do dia da publicação desta sprint. Nulo = não configurado, régua não aparece. */
  publishDay: string | null;
}

export interface AppConfig {
  vertical: string | null;
  jiraUsername: string | null;
  jiraPassword: string | null;
  /** Horas produtivas consideradas em 1 dia de trabalho. Nulo usa o padrão do sistema. */
  hoursPerDay: number | null;
  /** Tracejar em vermelho a parte da barra que representa atraso. Nulo usa o padrão do sistema (desligado). */
  dashDelayBar: boolean | null;
  /** Busca os dados do Jira automaticamente a cada 5 minutos. Nulo usa o padrão do sistema (ligado). */
  autoRefreshEnabled: boolean | null;
  /** Horas/PF e prazos por sprint, chaveados pelo id da sprint no Jira — sem entrada aqui, a sprint
   * usa o padrão do sistema pra horas/PF e não tem nenhuma régua de prazo (sem fallback global). */
  sprintSettings: Record<string, SprintSettings>;
}

function emptyConfig(): AppConfig {
  return {
    vertical: null,
    jiraUsername: null,
    jiraPassword: null,
    hoursPerDay: null,
    dashDelayBar: null,
    autoRefreshEnabled: null,
    sprintSettings: {},
  };
}

export async function readConfig(configPath: string): Promise<AppConfig> {
  try {
    const raw = await readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    return {
      vertical: parsed.vertical ?? null,
      jiraUsername: parsed.jiraUsername ?? null,
      jiraPassword: parsed.jiraPassword ?? null,
      hoursPerDay: parsed.hoursPerDay ?? null,
      dashDelayBar: parsed.dashDelayBar ?? null,
      autoRefreshEnabled: parsed.autoRefreshEnabled ?? null,
      sprintSettings: parsed.sprintSettings ?? {},
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return emptyConfig();
    }
    throw err;
  }
}

export async function writeConfig(configPath: string, config: AppConfig): Promise<void> {
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}
