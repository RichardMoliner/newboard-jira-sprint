import { Router } from 'express';
import { readConfig } from '../config/configStore.js';
import { discoverClosedSprints } from '../jira/discoverClosedSprints.js';
import { fetchClosedSprintsData } from '../jira/fetchBoardData.js';
import { readCachedSprintData, writeCachedSprintData, type CachedSprintData } from '../jira/sprintCache.js';
import { startProgress } from '../jira/progressLog.js';
import { DEFAULT_HOURS_PER_PF, DEFAULT_HOURS_PER_DAY, IMPL_SHARE } from '../compute/timeline.js';

export function historicalSprintsRouter(configPath: string, cacheDir: string): Router {
  const router = Router();

  router.get('/historical-sprints', async (req, res) => {
    const since = typeof req.query.since === 'string' ? req.query.since : null;
    if (!since) {
      res.status(400).json({ error: 'Informe o parâmetro "since" (AAAA-MM-DD).' });
      return;
    }

    const config = await readConfig(configPath);
    if (!config.vertical || !config.jiraUsername || !config.jiraPassword) {
      res.status(409).json({ error: 'Configuração incompleta. Informe vertical, usuário e senha do Jira.' });
      return;
    }

    try {
      const sprints = await discoverClosedSprints(config.vertical, since, {
        username: config.jiraUsername,
        password: config.jiraPassword,
      });
      res.json({ sprints });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido ao buscar sprints fechadas.';
      res.status(502).json({ error: message });
    }
  });

  router.get('/historical-board-data', async (req, res) => {
    const sprintIdsParam = typeof req.query.sprintIds === 'string' ? req.query.sprintIds : '';
    const sprintIds = sprintIdsParam
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    if (sprintIds.length === 0) {
      res.status(400).json({ error: 'Informe ao menos 1 sprint em "sprintIds" (separadas por vírgula).' });
      return;
    }

    const config = await readConfig(configPath);
    if (!config.vertical || !config.jiraUsername || !config.jiraPassword) {
      res.status(409).json({ error: 'Configuração incompleta. Informe vertical, usuário e senha do Jira.' });
      return;
    }

    try {
      const cached = await Promise.all(sprintIds.map((id) => readCachedSprintData(cacheDir, id)));
      const missingIds = sprintIds.filter((_, i) => cached[i] === null);

      const hoursPerPfBySprintId = Object.fromEntries(
        Object.entries(config.sprintSettings).map(([sprintId, settings]) => [sprintId, settings.hoursPerPf]),
      );

      const freshBySprintId = new Map<string, CachedSprintData>();
      if (missingIds.length > 0) {
        startProgress();
        const data = await fetchClosedSprintsData(
          config.vertical,
          missingIds,
          { username: config.jiraUsername, password: config.jiraPassword },
          hoursPerPfBySprintId,
          config.hoursPerDay ?? undefined,
        );
        for (const sprint of data.sprints) {
          const entry: CachedSprintData = { sprint, activities: data.activities.filter((a) => a.sprintId === sprint.id) };
          freshBySprintId.set(sprint.id, entry);
          await writeCachedSprintData(cacheDir, sprint.id, entry);
        }
      }

      const resolved = sprintIds.map((id, i) => cached[i] ?? freshBySprintId.get(id) ?? null);
      const missingAfterFetch = resolved.filter((r) => r === null);
      if (missingAfterFetch.length > 0) {
        res.status(502).json({ error: 'Não foi possível carregar uma ou mais sprints selecionadas — confira se os ids existem.' });
        return;
      }

      const entries = resolved as CachedSprintData[];
      const sprints = entries.map((e) => e.sprint);
      const activities = entries.flatMap((e) => e.activities);
      const today = sprints.map((s) => s.endDate).sort().slice(-1)[0];

      res.json({
        generatedAt: new Date().toISOString(),
        today,
        vertical: config.vertical,
        hoursPerDay: config.hoursPerDay ?? DEFAULT_HOURS_PER_DAY,
        defaultHoursPerPf: DEFAULT_HOURS_PER_PF,
        assumedTestSharePercent: (1 - IMPL_SHARE) * 100,
        sprints,
        activities,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido ao buscar dados históricos do Jira.';
      res.status(502).json({ error: message });
    }
  });

  return router;
}
