import { describe, expect, test } from 'vitest';
import { withOneRetry } from './withOneRetry.js';

describe('withOneRetry', () => {
  test('returns the result on first success without retrying', async () => {
    let calls = 0;
    const result = await withOneRetry(async () => {
      calls += 1;
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(calls).toBe(1);
  });

  test('retries once after a failure and returns the second attempt result', async () => {
    let calls = 0;
    const result = await withOneRetry(
      async () => {
        calls += 1;
        if (calls === 1) throw new Error('falha transitória');
        return 'ok na segunda';
      },
      { delayMs: 0 },
    );

    expect(result).toBe('ok na segunda');
    expect(calls).toBe(2);
  });

  test('calls onRetry with the error from the first attempt before retrying', async () => {
    const seenErrors: unknown[] = [];
    let calls = 0;
    await withOneRetry(
      async () => {
        calls += 1;
        if (calls === 1) throw new Error('primeira falha');
        return 'ok';
      },
      { delayMs: 0, onRetry: (err) => seenErrors.push(err) },
    );

    expect(seenErrors).toHaveLength(1);
    expect((seenErrors[0] as Error).message).toBe('primeira falha');
  });

  test('throws the second attempt error when both attempts fail', async () => {
    await expect(
      withOneRetry(
        async () => {
          throw new Error('falha definitiva');
        },
        { delayMs: 0 },
      ),
    ).rejects.toThrow('falha definitiva');
  });
});
