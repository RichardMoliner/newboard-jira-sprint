import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import express from 'express';
import request from 'supertest';
import { beforeEach, afterEach, describe, expect, test } from 'vitest';
import { adminRouter } from './admin.js';

function buildApp(configPath: string) {
  const app = express();
  app.use(express.json());
  app.use('/api', adminRouter(configPath));
  return app;
}

const ADMIN_PASSWORD = 'TEST_ADMIN_PASSWORD_PLACEHOLDER';

describe('adminRouter', () => {
  let tmpConfigPath: string;
  let tmpConfigPath2: string;

  beforeEach(() => {
    process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
    tmpConfigPath = join(tmpdir(), `config-admin-test-${Date.now()}-${Math.random()}.json`);
    tmpConfigPath2 = join(tmpdir(), `config-admin-test-${Date.now()}-${Math.random()}.json`);
  });

  afterEach(async () => {
    await rm(tmpConfigPath, { force: true });
    await rm(tmpConfigPath2, { force: true });
  });

  test('POST /admin/verify com senha correta retorna ok', async () => {
    const res = await request(buildApp(tmpConfigPath)).post('/api/admin/verify').send({ password: ADMIN_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  test('POST /admin/verify com senha incorreta retorna 401', async () => {
    const res = await request(buildApp(tmpConfigPath)).post('/api/admin/verify').send({ password: 'errada' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Senha incorreta.' });
  });

  test('GET /admin/webhooks sem header de senha retorna 401', async () => {
    const res = await request(buildApp(tmpConfigPath)).get('/api/admin/webhooks');
    expect(res.status).toBe(401);
  });

  test('POST /admin/webhooks com senha salva os webhooks e GET reflete como "set"', async () => {
    const app = buildApp(tmpConfigPath);
    const post = await request(app)
      .post('/api/admin/webhooks')
      .set('x-admin-password', ADMIN_PASSWORD)
      .send({ aplicacao: 'https://chat.googleapis.com/a', extensao: 'https://chat.googleapis.com/b' });
    expect(post.status).toBe(200);
    expect(post.body).toEqual({ aplicacaoSet: true, extensaoSet: true });

    const get = await request(app).get('/api/admin/webhooks').set('x-admin-password', ADMIN_PASSWORD);
    expect(get.body).toEqual({ aplicacaoSet: true, extensaoSet: true });
  });

  test('POST /admin/webhooks com campo ausente mantém o valor já salvo', async () => {
    const app = buildApp(tmpConfigPath2);
    await request(app).post('/api/admin/webhooks').set('x-admin-password', ADMIN_PASSWORD).send({ aplicacao: 'https://x' });
    const res = await request(app).post('/api/admin/webhooks').set('x-admin-password', ADMIN_PASSWORD).send({ extensao: 'https://y' });
    expect(res.body).toEqual({ aplicacaoSet: true, extensaoSet: true });
  });

  test('POST /admin/webhooks com campo vazio limpa o valor salvo', async () => {
    const app = buildApp(tmpConfigPath);
    await request(app)
      .post('/api/admin/webhooks')
      .set('x-admin-password', ADMIN_PASSWORD)
      .send({ aplicacao: 'https://x', extensao: 'https://y' });
    const res = await request(app).post('/api/admin/webhooks').set('x-admin-password', ADMIN_PASSWORD).send({ aplicacao: '' });
    expect(res.body).toEqual({ aplicacaoSet: false, extensaoSet: true });
  });

  test('POST /admin/webhooks com senha incorreta retorna 401 e não altera a config', async () => {
    const res = await request(buildApp(tmpConfigPath))
      .post('/api/admin/webhooks')
      .set('x-admin-password', 'errada')
      .send({ aplicacao: 'https://x' });
    expect(res.status).toBe(401);
  });

  test('ADMIN_PASSWORD indefinido nunca autentica, mesmo com header vazio', async () => {
    delete process.env.ADMIN_PASSWORD;
    const res = await request(buildApp(tmpConfigPath)).get('/api/admin/webhooks').set('x-admin-password', '');
    expect(res.status).toBe(401);
  });
});
