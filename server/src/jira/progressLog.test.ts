import { beforeEach, describe, expect, test } from 'vitest';
import { getMessages, report, startProgress } from './progressLog.js';

describe('progressLog', () => {
  beforeEach(() => {
    startProgress();
  });

  test('starts empty right after startProgress', () => {
    expect(getMessages()).toEqual([]);
  });

  test('report appends messages in order', () => {
    report('Buscando atividades da sprint...');
    report('Buscando detalhes das stories...');

    expect(getMessages()).toEqual(['Buscando atividades da sprint...', 'Buscando detalhes das stories...']);
  });

  test('startProgress clears messages from a previous run', () => {
    report('mensagem antiga');
    startProgress();

    expect(getMessages()).toEqual([]);
  });
});
