import { Router, type NextFunction, type Request, type Response } from 'express';
import { readConfig, writeConfig, type AppConfig } from '../config/configStore.js';

function toPublicWebhooks(config: AppConfig) {
  // Nunca devolve a URL salva pro cliente — só se ela já está configurada.
  return {
    aplicacaoSet: Boolean(config.webhooks.aplicacao),
    extensaoSet: Boolean(config.webhooks.extensao),
  };
}

/** Analisa um campo de texto opcional do body; string vazia limpa o valor, ausente mantém o atual. */
function parseOptionalTextField(rawValue: unknown, currentValue: string | null): string | null {
  if (rawValue === undefined) {
    return currentValue;
  }
  if (rawValue === '' || rawValue === null) {
    return null;
  }
  return typeof rawValue === 'string' ? rawValue : currentValue;
}

/**
 * Compara a senha recebida com `process.env.ADMIN_PASSWORD`. `undefined` (variável não configurada)
 * nunca autentica, mesmo que a senha recebida também seja vazia/undefined.
 */
function isAdminPasswordValid(password: unknown): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return false;
  }
  return typeof password === 'string' && password === adminPassword;
}

/** Middleware que exige a senha de admin no header `x-admin-password`. */
function requireAdminPassword(req: Request, res: Response, next: NextFunction): void {
  const password = req.header('x-admin-password');
  if (!isAdminPasswordValid(password)) {
    res.status(401).json({ error: 'Senha incorreta.' });
    return;
  }
  next();
}

export function adminRouter(configPath: string): Router {
  const router = Router();

  router.post('/admin/verify', (req, res) => {
    if (!isAdminPasswordValid(req.body?.password)) {
      res.status(401).json({ error: 'Senha incorreta.' });
      return;
    }
    res.json({ ok: true });
  });

  router.get('/admin/webhooks', requireAdminPassword, async (_req, res) => {
    const config = await readConfig(configPath);
    res.json(toPublicWebhooks(config));
  });

  router.post('/admin/webhooks', requireAdminPassword, async (req, res) => {
    const existing = await readConfig(configPath);
    const aplicacao = parseOptionalTextField(req.body?.aplicacao, existing.webhooks.aplicacao);
    const extensao = parseOptionalTextField(req.body?.extensao, existing.webhooks.extensao);

    const next: AppConfig = {
      ...existing,
      webhooks: { aplicacao, extensao },
    };
    await writeConfig(configPath, next);
    res.json(toPublicWebhooks(next));
  });

  return router;
}
