import { readFile, writeFile } from 'node:fs/promises';

export interface AppConfig {
  vertical: string | null;
  jiraUsername: string | null;
  jiraPassword: string | null;
  /** Horas de trabalho por Ponto de Função — produtividade da vertical. Nulo usa o padrão do sistema. */
  hoursPerPf: number | null;
  /** Horas produtivas consideradas em 1 dia de trabalho. Nulo usa o padrão do sistema. */
  hoursPerDay: number | null;
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
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { vertical: null, jiraUsername: null, jiraPassword: null, hoursPerPf: null, hoursPerDay: null };
    }
    throw err;
  }
}

export async function writeConfig(configPath: string, config: AppConfig): Promise<void> {
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}
