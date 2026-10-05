import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Activity, SprintInfo } from '../domain/types.js';

export interface CachedSprintData {
  sprint: SprintInfo;
  activities: Activity[];
}

function cachePath(cacheDir: string, sprintId: string): string {
  return join(cacheDir, `${sprintId}.json`);
}

/** Sprints fechadas não mudam mais — uma vez em cache, fica pra sempre (sem TTL/invalidação). */
export async function readCachedSprintData(cacheDir: string, sprintId: string): Promise<CachedSprintData | null> {
  try {
    const raw = await readFile(cachePath(cacheDir, sprintId), 'utf-8');
    return JSON.parse(raw) as CachedSprintData;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export async function writeCachedSprintData(cacheDir: string, sprintId: string, data: CachedSprintData): Promise<void> {
  await mkdir(cacheDir, { recursive: true });
  await writeFile(cachePath(cacheDir, sprintId), JSON.stringify(data), 'utf-8');
}
