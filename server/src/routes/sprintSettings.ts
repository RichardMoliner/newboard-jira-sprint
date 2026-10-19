import { Router } from 'express';
import { readConfig, writeConfig, type SprintSettings } from '../config/configStore.js';
import { parseOptionalDateField } from './config.js';

function emptySprintSettings(): SprintSettings {
  return { hoursPerPf: null, lastPublishDay: null, lastTestDay: null, publishDay: null, group: null, includedInGroupFilter: true };
}

const SPRINT_GROUPS = ['aplicacao', 'extensao'] as const;
type SprintGroup = (typeof SPRINT_GROUPS)[number];

/** Analisa o tipo de sprint (combobox) opcional do body: string vazia ou null limpa pra "sem
 * grupo", ausente mantém o atual, valor fora da lista conhecida é erro. */
export function parseOptionalSprintGroupField(
  rawValue: unknown,
  currentValue: SprintGroup | null,
): { value: SprintGroup | null; error?: string } {
  if (rawValue === undefined) return { value: currentValue };
  if (rawValue === '' || rawValue === null) return { value: null };
  if (typeof rawValue !== 'string' || !SPRINT_GROUPS.includes(rawValue as SprintGroup)) {
    return { value: currentValue, error: `deve ser um dos valores: ${SPRINT_GROUPS.join(', ')}.` };
  }
  return { value: rawValue as SprintGroup };
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

    const group = parseOptionalSprintGroupField(req.body?.group, existing.group);
    if (group.error) {
      res.status(400).json({ error: `Tipo de sprint ${group.error}` });
      return;
    }

    const includedInGroupFilter =
      req.body?.includedInGroupFilter === undefined ? (existing.includedInGroupFilter ?? true) : Boolean(req.body.includedInGroupFilter);

    const next: SprintSettings = {
      hoursPerPf: hoursPerPf.value,
      lastPublishDay: lastPublishDay.value,
      lastTestDay: lastTestDay.value,
      publishDay: publishDay.value,
      group: group.value,
      includedInGroupFilter,
    };
    config.sprintSettings[sprintId] = next;
    await writeConfig(configPath, config);
    res.json(next);
  });

  return router;
}
