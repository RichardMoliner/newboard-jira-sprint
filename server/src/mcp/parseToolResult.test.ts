import { describe, expect, test } from 'vitest';
import { parseToolResult } from './parseToolResult.js';

describe('parseToolResult', () => {
  test('parses the JSON text content of a successful tool result', () => {
    const result = {
      content: [{ type: 'text', text: '{"issues":[],"total":0}' }],
      isError: false,
    };
    expect(parseToolResult(result)).toEqual({ issues: [], total: 0 });
  });

  test('throws with the text content when the tool reports an error', () => {
    const result = {
      content: [{ type: 'text', text: 'JQL inválida' }],
      isError: true,
    };
    expect(() => parseToolResult(result)).toThrow('JQL inválida');
  });

  test('throws a clear error when there is no text content', () => {
    const result = { content: [], isError: false };
    expect(() => parseToolResult(result)).toThrow(/resposta inesperada/i);
  });
});
