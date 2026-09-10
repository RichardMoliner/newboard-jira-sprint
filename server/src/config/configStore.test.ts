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
  test('returns all fields null when the config file does not exist yet', async () => {
    const configPath = await tempConfigPath();
    expect(await readConfig(configPath)).toEqual({
      vertical: null,
      jiraUsername: null,
      jiraPassword: null,
      hoursPerPf: null,
      hoursPerDay: null,
    });
  });

  test('round-trips a saved config', async () => {
    const configPath = await tempConfigPath();
    await writeConfig(configPath, {
      vertical: 'CONTRATOS',
      jiraUsername: 'richard.junior',
      jiraPassword: 'segredo',
      hoursPerPf: 6,
      hoursPerDay: 8,
    });
    expect(await readConfig(configPath)).toEqual({
      vertical: 'CONTRATOS',
      jiraUsername: 'richard.junior',
      jiraPassword: 'segredo',
      hoursPerPf: 6,
      hoursPerDay: 8,
    });
  });

  test('overwrites a previously saved config', async () => {
    const configPath = await tempConfigPath();
    await writeConfig(configPath, {
      vertical: 'CONTRATOS',
      jiraUsername: 'richard.junior',
      jiraPassword: 'segredo',
      hoursPerPf: 6,
      hoursPerDay: 8,
    });
    await writeConfig(configPath, {
      vertical: 'FINANCAS',
      jiraUsername: 'outro.usuario',
      jiraPassword: 'outrasenha',
      hoursPerPf: 8,
      hoursPerDay: 6,
    });
    expect(await readConfig(configPath)).toEqual({
      vertical: 'FINANCAS',
      jiraUsername: 'outro.usuario',
      jiraPassword: 'outrasenha',
      hoursPerPf: 8,
      hoursPerDay: 6,
    });
  });
});
