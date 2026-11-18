import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** Avatar de pessoa não muda por sprint — cache único (não por sprint), sem TTL/invalidação. */
export async function readAvatarCache(cachePath: string): Promise<Record<string, string | null>> {
  try {
    const raw = await readFile(cachePath, 'utf-8');
    return JSON.parse(raw) as Record<string, string | null>;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw err;
  }
}

export async function writeAvatarCache(cachePath: string, data: Record<string, string | null>): Promise<void> {
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(data), 'utf-8');
}
