import { describe, expect, test, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readCachedSprintData, writeCachedSprintData } from './sprintCache.js';
import type { SprintInfo } from '../domain/types.js';

const tempDirs: string[] = [];

async function tempCacheDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'painel-sprints-cache-'));
  tempDirs.push(dir);
  // Usa um subdiretório que ainda não existe, pra testar que writeCachedSprintData cria a pasta sozinho.
  return join(dir, 'historical-sprints');
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const sprint: SprintInfo = {
  id: '7400',
  name: 'ALM S08 2026',
  startDate: '2026-08-01',
  endDate: '2026-08-15',
  startDateTime: '2026-08-01T00:00:00.000-03:00',
  endDateTime: '2026-08-15T23:59:00.000-03:00',
};

describe('sprintCache', () => {
  test('returns null when nothing is cached yet for that sprint id', async () => {
    const cacheDir = await tempCacheDir();
    expect(await readCachedSprintData(cacheDir, '7400')).toBeNull();
  });

  test('round-trips a cached sprint, creating the cache directory if needed', async () => {
    const cacheDir = await tempCacheDir();
    await writeCachedSprintData(cacheDir, '7400', { sprint, activities: [] });
    expect(await readCachedSprintData(cacheDir, '7400')).toEqual({ sprint, activities: [] });
  });

  test('keeps different sprint ids in separate cache entries', async () => {
    const cacheDir = await tempCacheDir();
    const otherSprint: SprintInfo = { ...sprint, id: '7300', name: 'ALM S07 2026' };
    await writeCachedSprintData(cacheDir, '7400', { sprint, activities: [] });
    await writeCachedSprintData(cacheDir, '7300', { sprint: otherSprint, activities: [] });
    expect((await readCachedSprintData(cacheDir, '7400'))?.sprint.id).toBe('7400');
    expect((await readCachedSprintData(cacheDir, '7300'))?.sprint.id).toBe('7300');
  });

  test('overwrites a previously cached entry for the same sprint id', async () => {
    const cacheDir = await tempCacheDir();
    await writeCachedSprintData(cacheDir, '7400', { sprint, activities: [] });
    const updated = { sprint, activities: [{ key: 'EC-1' } as unknown as import('../domain/types.js').Activity] };
    await writeCachedSprintData(cacheDir, '7400', updated);
    expect(await readCachedSprintData(cacheDir, '7400')).toEqual(updated);
  });
});
