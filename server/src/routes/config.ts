import { Router } from 'express';
import { readConfig, writeConfig } from '../config/configStore.js';

export function configRouter(configPath: string): Router {
  const router = Router();

  router.get('/config', async (_req, res) => {
    const config = await readConfig(configPath);
    res.json(config);
  });

  router.post('/config', async (req, res) => {
    const vertical = typeof req.body?.vertical === 'string' ? req.body.vertical.trim() : '';
    if (!vertical) {
      res.status(400).json({ error: 'Informe a vertical.' });
      return;
    }
    await writeConfig(configPath, { vertical });
    res.json({ vertical });
  });

  return router;
}
