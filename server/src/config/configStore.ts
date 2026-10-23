import { readFile, rename, writeFile } from 'node:fs/promises';

export interface SprintSettings {
  /** Horas de trabalho por Ponto de Função nesta sprint. Nulo usa o padrão do sistema. */
  hoursPerPf: number | null;
  /** Horas produtivas por dia desta sprint — congelado com o valor efetivo (configuração global ou
   * padrão do sistema) na primeira vez que a sprint é consultada no Histórico, pra sprint fechada não
   * mudar de cálculo se a configuração global mudar depois. Nulo = sprint ainda em execução, nunca
   * congelada (usa a configuração atual nesse caso). */
  hoursPerDay: number | null;
  /** Data (YYYY-MM-DD) do último dia de publicação desta sprint. Nulo = não configurado, régua não aparece. */
  lastPublishDay: string | null;
  /** Data (YYYY-MM-DD) do último dia de testes desta sprint. Nulo = não configurado, régua não aparece. */
  lastTestDay: string | null;
  /** Data (YYYY-MM-DD) do dia da publicação desta sprint. Nulo = não configurado, régua não aparece. */
  publishDay: string | null;
  /** Tipo da sprint pro agrupador da Linha do tempo. Nulo = sem grupo, sprint continua como pill individual. */
  group: 'aplicacao' | 'extensao' | null;
  /** Se a sprint está marcada no popover do seu grupo — só relevante quando `group` não é nulo. */
  includedInGroupFilter: boolean;
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
  /** URLs de webhook para notificações de liberação antecipada no Google Chat. */
  webhooks: { aplicacao: string | null; extensao: string | null };
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
    webhooks: { aplicacao: null, extensao: null },
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
      webhooks: {
        aplicacao: parsed.webhooks?.aplicacao ?? null,
        extensao: parsed.webhooks?.extensao ?? null,
      },
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT' || err instanceof SyntaxError) {
      return emptyConfig();
    }
    throw err;
  }
}

/**
 * Escreve num arquivo temporário ao lado e troca pelo definitivo com rename (atômico na mesma
 * pasta) — grava direto no `configPath` deixava uma janela onde um restart do servidor no meio da
 * escrita (ex.: tsx watch recarregando por uma mudança de código) truncava o arquivo e perdia toda
 * a configuração salva.
 */
export async function writeConfig(configPath: string, config: AppConfig): Promise<void> {
  const tmpPath = `${configPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmpPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  await rename(tmpPath, configPath);
}
