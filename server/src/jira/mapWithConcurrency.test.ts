import { describe, expect, test } from 'vitest';
import { mapWithConcurrency } from './mapWithConcurrency.js';

describe('mapWithConcurrency', () => {
  test('maps every item, preserving input order in the output', async () => {
    const result = await mapWithConcurrency([1, 2, 3, 4], 2, async (n) => n * 10);
    expect(result).toEqual([10, 20, 30, 40]);
  });

  test('never runs more than `limit` tasks at the same time', async () => {
    let active = 0;
    let maxActive = 0;

    await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (n) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return n;
    });

    expect(maxActive).toBeLessThanOrEqual(2);
  });

  test('propagates an error thrown by any task', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('boom');
        return n;
      }),
    ).rejects.toThrow('boom');
  });
});
