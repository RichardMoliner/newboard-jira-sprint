import { readFile, writeFile } from 'node:fs/promises';

export interface AppConfig {
  vertical: string | null;
  jiraUsername: string | null;
  jiraPassword: string | null;
  /** Horas de trabalho por Ponto de Função — produtividade da vertical. Nulo usa o padrão do sistema. */
  hoursPerPf: number | null;
  /** Horas produtivas consideradas em 1 dia de trabalho. Nulo usa o padrão do sistema. */
  hoursPerDay: number | null;
  /** Tracejar em vermelho a parte da barra que representa atraso. Nulo usa o padrão do sistema (desligado). */
  dashDelayBar: boolean | null;
  /** Data (YYYY-MM-DD) do último dia de publicação. Nulo = não configurado, régua não aparece. */
  lastPublishDay: string | null;
  /** Data (YYYY-MM-DD) do último dia de testes. Nulo = não configurado, régua não aparece. */
  lastTestDay: string | null;
  /** Data (YYYY-MM-DD) do dia da publicação. Nulo = não configurado, régua não aparece. */
  publishDay: string | null;
}

export async function readConfig(configPath: string): Promise<AppConfig> {
  try {
    const raw = await readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    return {
      vertical: parsed.vertical ?? null,
      jiraUsername: parsed.jiraUsername ?? null,
      jiraPassword: parsed.jiraPassword ?? null,
      hoursPerPf: parsed.hoursPerPf ?? null,
      hoursPerDay: parsed.hoursPerDay ?? null,
      dashDelayBar: parsed.dashDelayBar ?? null,
      lastPublishDay: parsed.lastPublishDay ?? null,
      lastTestDay: parsed.lastTestDay ?? null,
      publishDay: parsed.publishDay ?? null,
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        vertical: null,
        jiraUsername: null,
        jiraPassword: null,
        hoursPerPf: null,
        hoursPerDay: null,
        dashDelayBar: null,
        lastPublishDay: null,
        lastTestDay: null,
        publishDay: null,
      };
    }
    throw err;
  }
}

export async function writeConfig(configPath: string, config: AppConfig): Promise<void> {
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}
