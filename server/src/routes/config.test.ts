import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { parseOptionalDateField, configRouter } from './config.js';

function buildApp(configPath: string) {
  const app = express();
  app.use(express.json());
  app.use('/api', configRouter(configPath));
  return app;
}

describe('configRouter POST /config', () => {
  let tmpConfigPath: string;

  beforeEach(() => {
    tmpConfigPath = join(tmpdir(), `config-route-test-${Date.now()}-${Math.random()}.json`);
  });

  afterEach(async () => {
    await rm(tmpConfigPath, { force: true });
  });

  test('preserva os webhooks já salvos ao salvar a tela de Configurações', async () => {
    const app = buildApp(tmpConfigPath);

    // Simula webhooks já configurados via tela de Admin, escrevendo direto no arquivo de config.
    const { writeConfig, readConfig } = await import('../config/configStore.js');
    const existing = await readConfig(tmpConfigPath);
    await writeConfig(tmpConfigPath, {
      ...existing,
      webhooks: { aplicacao: 'https://chat.googleapis.com/a', extensao: 'https://chat.googleapis.com/b' },
    });

    const post = await request(app).post('/api/config').send({
      vertical: 'Contratos',
      jiraUsername: 'usuario',
      jiraPassword: 'senha',
    });
    expect(post.status).toBe(200);

    const afterSave = await readConfig(tmpConfigPath);
    expect(afterSave.webhooks).toEqual({
      aplicacao: 'https://chat.googleapis.com/a',
      extensao: 'https://chat.googleapis.com/b',
    });

    const get = await request(app).get('/api/config');
    expect(get.status).toBe(200);

    const afterGet = await readConfig(tmpConfigPath);
    expect(afterGet.webhooks).toEqual({
      aplicacao: 'https://chat.googleapis.com/a',
      extensao: 'https://chat.googleapis.com/b',
    });
  });
});

describe('parseOptionalDateField', () => {
  test('keeps the current value when the field is absent from the body', () => {
    expect(parseOptionalDateField(undefined, '2026-09-01')).toEqual({ value: '2026-09-01' });
  });

  test('clears the value when an empty string is sent', () => {
    expect(parseOptionalDateField('', '2026-09-01')).toEqual({ value: null });
  });

  test('accepts a valid YYYY-MM-DD date string', () => {
    expect(parseOptionalDateField('2026-10-05', null)).toEqual({ value: '2026-10-05' });
  });

  test('rejects a malformed date string', () => {
    expect(parseOptionalDateField('05/10/2026', null)).toEqual({
      value: null,
      error: 'deve estar no formato AAAA-MM-DD.',
    });
  });

  test('rejects a non-string value', () => {
    expect(parseOptionalDateField(123, null)).toEqual({
      value: null,
      error: 'deve estar no formato AAAA-MM-DD.',
    });
  });
});
