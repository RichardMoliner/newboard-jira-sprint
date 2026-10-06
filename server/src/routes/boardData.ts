import { Router } from 'express';
import { readConfig } from '../config/configStore.js';
import { fetchBoardData } from '../jira/fetchBoardData.js';
import { getMessages, startProgress } from '../jira/progressLog.js';

export function boardDataRouter(configPath: string): Router {
  const router = Router();

  router.get('/board-data/progress', (_req, res) => {
    res.json({ messages: getMessages() });
  });

  router.get('/board-data', async (_req, res) => {
    const config = await readConfig(configPath);
    if (!config.vertical || !config.jiraUsername || !config.jiraPassword) {
      res.status(409).json({ error: 'Configuração incompleta. Informe vertical, usuário e senha do Jira.' });
      return;
    }

    const hoursPerPfBySprintId = Object.fromEntries(
      Object.entries(config.sprintSettings).map(([sprintId, settings]) => [sprintId, settings.hoursPerPf]),
    );

    startProgress();
    try {
      const data = await fetchBoardData(
        config.vertical,
        { username: config.jiraUsername, password: config.jiraPassword },
        hoursPerPfBySprintId,
        config.hoursPerDay ?? undefined,
      );
      res.json(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido ao buscar dados do Jira.';
      res.status(502).json({ error: message });
    }
  });

  return router;
}
