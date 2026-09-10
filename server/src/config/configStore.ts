import { readFile, writeFile } from 'node:fs/promises';

export interface AppConfig {
  vertical: string | null;
}

export async function readConfig(configPath: string): Promise<AppConfig> {
  try {
    const raw = await readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    return { vertical: parsed.vertical ?? null };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { vertical: null };
    }
    throw err;
  }
}

export async function writeConfig(configPath: string, config: AppConfig): Promise<void> {
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}
