import { describe, expect, test, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readConfig, writeConfig } from './configStore.js';

const tempDirs: string[] = [];

async function tempConfigPath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'painel-sprints-config-'));
  tempDirs.push(dir);
  return join(dir, 'config.json');
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('configStore', () => {
  test('returns vertical=null when the config file does not exist yet', async () => {
    const configPath = await tempConfigPath();
    expect(await readConfig(configPath)).toEqual({ vertical: null });
  });

  test('round-trips a saved vertical', async () => {
    const configPath = await tempConfigPath();
    await writeConfig(configPath, { vertical: 'CONTRATOS' });
    expect(await readConfig(configPath)).toEqual({ vertical: 'CONTRATOS' });
  });

  test('overwrites a previously saved vertical', async () => {
    const configPath = await tempConfigPath();
    await writeConfig(configPath, { vertical: 'CONTRATOS' });
    await writeConfig(configPath, { vertical: 'FINANCAS' });
    expect(await readConfig(configPath)).toEqual({ vertical: 'FINANCAS' });
  });
});
