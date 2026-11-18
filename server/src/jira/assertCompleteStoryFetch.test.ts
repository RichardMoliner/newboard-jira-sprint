import { describe, expect, test } from 'vitest';
import { assertCompleteStoryFetch } from './assertCompleteStoryFetch.js';

describe('assertCompleteStoryFetch', () => {
  test('does not throw when every story hit resolved to a detail', () => {
    const hits = [{ key: 'COM-1' }, { key: 'COM-2' }];
    const details = [{ key: 'COM-1' }, { key: 'COM-2' }];
    expect(() => assertCompleteStoryFetch(hits, details)).not.toThrow();
  });

  test('does not throw when there are no story hits at all', () => {
    expect(() => assertCompleteStoryFetch([], [])).not.toThrow();
  });

  test('throws listing the failed keys when some get_issue calls failed (returned null)', () => {
    const hits = [{ key: 'COM-1' }, { key: 'COM-2' }, { key: 'COM-3' }];
    const details = [{ key: 'COM-1' }, null, null];
    expect(() => assertCompleteStoryFetch(hits, details)).toThrow(/COM-2, COM-3/);
  });

  test('error message mentions how many failed out of the total', () => {
    const hits = [{ key: 'COM-1' }, { key: 'COM-2' }, { key: 'COM-3' }];
    const details = [{ key: 'COM-1' }, null, null];
    expect(() => assertCompleteStoryFetch(hits, details)).toThrow(/2 de 3/);
  });

  test('throws when every single story failed', () => {
    const hits = [{ key: 'COM-1' }];
    const details = [null];
    expect(() => assertCompleteStoryFetch(hits, details)).toThrow(/COM-1/);
  });
});
