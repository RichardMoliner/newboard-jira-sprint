import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readNotifiedState, writeNotifiedState, recordNotified } from './notifiedStore.js';
import { NotifiedState } from './eligibility.js';
import { readFile, writeFile } from 'node:fs/promises';
import { rm } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

describe('recordNotified', () => {
  it('adiciona o marco à lista existente quando legalDeadline bate', () => {
    const state = { 'PROJ-1': { legalDeadline: '2026-10-27', milestones: [5] } };
    const next = recordNotified(state, 'PROJ-1', '2026-10-27', 3);
    expect(next['PROJ-1']).toEqual({ legalDeadline: '2026-10-27', milestones: [5, 3] });
  });

  it('cria entrada nova para uma chave inexistente', () => {
    const next = recordNotified({}, 'PROJ-2', '2026-11-01', 5);
    expect(next['PROJ-2']).toEqual({ legalDeadline: '2026-11-01', milestones: [5] });
  });

  it('reseta os marcos quando o legalDeadline registrado é diferente do atual', () => {
    const state = { 'PROJ-1': { legalDeadline: '2026-10-27', milestones: [5, 3] } };
    const next = recordNotified(state, 'PROJ-1', '2026-11-15', 5);
    expect(next['PROJ-1']).toEqual({ legalDeadline: '2026-11-15', milestones: [5] });
  });

  it('não muta o state recebido', () => {
    const state = { 'PROJ-1': { legalDeadline: '2026-10-27', milestones: [5] } };
    recordNotified(state, 'PROJ-1', '2026-10-27', 3);
    expect(state['PROJ-1'].milestones).toEqual([5]);
  });
});

describe('readNotifiedState / writeNotifiedState', () => {
  let tmpDir: string;
  let testPath: string;

  beforeEach(async () => {
    tmpDir = await readFile(os.tmpdir(), 'utf-8').catch(() => os.tmpdir());
    testPath = path.join(tmpDir, `notified-${Date.now()}-${Math.random()}.json`);
  });

  afterEach(async () => {
    try {
      await rm(testPath);
    } catch {
      // file might not exist
    }
  });

  it('retorna {} quando o arquivo não existe', async () => {
    const state = await readNotifiedState(testPath);
    expect(state).toEqual({});
  });

  it('persiste e recupera o state corretamente', async () => {
    const originalState: NotifiedState = {
      'PROJ-1': { legalDeadline: '2026-10-27', milestones: [5, 3] },
      'PROJ-2': { legalDeadline: '2026-11-01', milestones: [1] },
    };

    await writeNotifiedState(testPath, originalState);
    const recovered = await readNotifiedState(testPath);

    expect(recovered).toEqual(originalState);
  });

  it('retorna {} se o arquivo está corrompido', async () => {
    // Write invalid JSON
    await writeFile(testPath, 'not valid json', 'utf-8');
    const state = await readNotifiedState(testPath);
    expect(state).toEqual({});
  });

  it('sobrescreve o arquivo anterior na escrita', async () => {
    const state1: NotifiedState = {
      'PROJ-1': { legalDeadline: '2026-10-27', milestones: [5] },
    };
    await writeNotifiedState(testPath, state1);

    const state2: NotifiedState = {
      'PROJ-2': { legalDeadline: '2026-11-01', milestones: [3, 1] },
    };
    await writeNotifiedState(testPath, state2);

    const recovered = await readNotifiedState(testPath);
    expect(recovered).toEqual(state2);
    expect(recovered['PROJ-1']).toBeUndefined();
  });
});
