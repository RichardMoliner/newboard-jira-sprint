import { Router } from 'express';
import { readConfig, writeConfig, type SprintSettings } from '../config/configStore.js';
import { parseOptionalDateField } from './config.js';

function emptySprintSettings(): SprintSettings {
  return { hoursPerPf: null, lastPublishDay: null, lastTestDay: null, publishDay: null };
}

/** Analisa um campo numérico opcional e anulável do body: string vazia ou null limpa o valor
 * (volta a usar o padrão do sistema), ausente mantém o atual, número positivo define o novo valor. */
export function parseOptionalPositiveNumberField(
  rawValue: unknown,
  currentValue: number | null,
): { value: number | null; error?: string } {
  if (rawValue === undefined) return { value: currentValue };
  if (rawValue === '' || rawValue === null) return { value: null };
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { value: currentValue, error: 'deve ser um número maior que zero.' };
  }
  return { value: parsed };
}

/** Configuração por sprint (horas/PF e prazos) — sem fallback global: uma sprint sem entrada aqui
 * usa o padrão do sistema pra horas/PF e não tem nenhuma régua de prazo. */
export function sprintSettingsRouter(configPath: string): Router {
  const router = Router();

  router.get('/sprint-settings', async (_req, res) => {
    const config = await readConfig(configPath);
    res.json(config.sprintSettings);
  });

  router.post('/sprint-settings/:sprintId', async (req, res) => {
    const { sprintId } = req.params;
    const config = await readConfig(configPath);
    const existing = config.sprintSettings[sprintId] ?? emptySprintSettings();

    const hoursPerPf = parseOptionalPositiveNumberField(req.body?.hoursPerPf, existing.hoursPerPf);
    if (hoursPerPf.error) {
      res.status(400).json({ error: `Horas por PF ${hoursPerPf.error}` });
      return;
    }

    const lastPublishDay = parseOptionalDateField(req.body?.lastPublishDay, existing.lastPublishDay);
    if (lastPublishDay.error) {
      res.status(400).json({ error: `Último dia de publicação ${lastPublishDay.error}` });
      return;
    }

    const lastTestDay = parseOptionalDateField(req.body?.lastTestDay, existing.lastTestDay);
    if (lastTestDay.error) {
      res.status(400).json({ error: `Último dia de testes ${lastTestDay.error}` });
      return;
    }

    const publishDay = parseOptionalDateField(req.body?.publishDay, existing.publishDay);
    if (publishDay.error) {
      res.status(400).json({ error: `Dia da publicação ${publishDay.error}` });
      return;
    }

    const next: SprintSettings = {
      hoursPerPf: hoursPerPf.value,
      lastPublishDay: lastPublishDay.value,
      lastTestDay: lastTestDay.value,
      publishDay: publishDay.value,
    };
    config.sprintSettings[sprintId] = next;
    await writeConfig(configPath, config);
    res.json(next);
  });

  return router;
}
