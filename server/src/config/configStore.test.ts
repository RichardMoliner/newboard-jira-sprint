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
  test('returns all fields null (and sprintSettings empty) when the config file does not exist yet', async () => {
    const configPath = await tempConfigPath();
    expect(await readConfig(configPath)).toEqual({
      vertical: null,
      jiraUsername: null,
      jiraPassword: null,
      hoursPerDay: null,
      dashDelayBar: null,
      autoRefreshEnabled: null,
      sprintSettings: {},
    });
  });

  test('round-trips a saved config, including per-sprint settings', async () => {
    const configPath = await tempConfigPath();
    await writeConfig(configPath, {
      vertical: 'CONTRATOS',
      jiraUsername: 'richard.junior',
      jiraPassword: 'segredo',
      hoursPerDay: 8,
      dashDelayBar: true,
      autoRefreshEnabled: false,
      sprintSettings: {
        '7590': { hoursPerPf: 6, lastPublishDay: '2026-10-01', lastTestDay: '2026-10-03', publishDay: '2026-10-05' },
      },
    });
    expect(await readConfig(configPath)).toEqual({
      vertical: 'CONTRATOS',
      jiraUsername: 'richard.junior',
      jiraPassword: 'segredo',
      hoursPerDay: 8,
      dashDelayBar: true,
      autoRefreshEnabled: false,
      sprintSettings: {
        '7590': { hoursPerPf: 6, lastPublishDay: '2026-10-01', lastTestDay: '2026-10-03', publishDay: '2026-10-05' },
      },
    });
  });

  test('overwrites a previously saved config', async () => {
    const configPath = await tempConfigPath();
    await writeConfig(configPath, {
      vertical: 'CONTRATOS',
      jiraUsername: 'richard.junior',
      jiraPassword: 'segredo',
      hoursPerDay: 8,
      dashDelayBar: true,
      autoRefreshEnabled: false,
      sprintSettings: { '7590': { hoursPerPf: 6, lastPublishDay: null, lastTestDay: null, publishDay: null } },
    });
    await writeConfig(configPath, {
      vertical: 'FINANCAS',
      jiraUsername: 'outro.usuario',
      jiraPassword: 'outrasenha',
      hoursPerDay: 6,
      dashDelayBar: false,
      autoRefreshEnabled: true,
      sprintSettings: {},
    });
    expect(await readConfig(configPath)).toEqual({
      vertical: 'FINANCAS',
      jiraUsername: 'outro.usuario',
      jiraPassword: 'outrasenha',
      hoursPerDay: 6,
      dashDelayBar: false,
      autoRefreshEnabled: true,
      sprintSettings: {},
    });
  });

  test('defaults sprintSettings to an empty object when missing from a saved file (older config)', async () => {
    const configPath = await tempConfigPath();
    await writeConfig(configPath, {
      vertical: 'CONTRATOS',
      jiraUsername: 'richard.junior',
      jiraPassword: 'segredo',
      hoursPerDay: 8,
      dashDelayBar: true,
      autoRefreshEnabled: false,
      sprintSettings: undefined as unknown as Record<string, never>,
    });
    expect((await readConfig(configPath)).sprintSettings).toEqual({});
  });
});
