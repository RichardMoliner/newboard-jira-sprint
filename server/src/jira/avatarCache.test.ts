import { describe, expect, test, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readAvatarCache, writeAvatarCache } from './avatarCache.js';

const tempDirs: string[] = [];

async function tempCachePath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'painel-sprints-avatars-'));
  tempDirs.push(dir);
  // Subdiretório que ainda não existe, pra testar que writeAvatarCache cria a pasta sozinha.
  return join(dir, 'avatars', 'cache.json');
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('avatarCache', () => {
  test('retorna cache vazio quando nada foi persistido ainda', async () => {
    const cachePath = await tempCachePath();
    expect(await readAvatarCache(cachePath)).toEqual({});
  });

  test('faz round-trip do cache, criando o diretório se preciso', async () => {
    const cachePath = await tempCachePath();
    await writeAvatarCache(cachePath, { Fulano: 'https://jira/avatar/Fulano', SemFoto: null });
    expect(await readAvatarCache(cachePath)).toEqual({ Fulano: 'https://jira/avatar/Fulano', SemFoto: null });
  });

  test('sobrescreve o cache anterior', async () => {
    const cachePath = await tempCachePath();
    await writeAvatarCache(cachePath, { Fulano: 'https://jira/avatar/Fulano' });
    await writeAvatarCache(cachePath, { Fulano: 'https://jira/avatar/Fulano', Sicrano: null });
    expect(await readAvatarCache(cachePath)).toEqual({ Fulano: 'https://jira/avatar/Fulano', Sicrano: null });
  });
});
