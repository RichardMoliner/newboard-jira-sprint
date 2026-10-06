import { Router } from 'express';
import { readConfig, writeConfig, type AppConfig } from '../config/configStore.js';
import { DEFAULT_HOURS_PER_DAY } from '../compute/timeline.js';

function toPublicConfig(config: AppConfig) {
  // Nunca devolve a senha em texto puro para o cliente — só se ela já está configurada.
  return {
    vertical: config.vertical,
    jiraUsername: config.jiraUsername,
    jiraPasswordSet: Boolean(config.jiraPassword),
    hoursPerDay: config.hoursPerDay ?? DEFAULT_HOURS_PER_DAY,
    dashDelayBar: config.dashDelayBar ?? false,
    autoRefreshEnabled: config.autoRefreshEnabled ?? true,
  };
}

const DATE_FIELD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Analisa um campo de data opcional do body; string vazia limpa o valor, ausente mantém o atual. */
export function parseOptionalDateField(
  rawValue: unknown,
  currentValue: string | null,
): { value: string | null; error?: string } {
  if (rawValue === undefined) {
    return { value: currentValue };
  }
  if (rawValue === '' || rawValue === null) {
    return { value: null };
  }
  if (typeof rawValue !== 'string' || !DATE_FIELD_PATTERN.test(rawValue)) {
    return { value: null, error: 'deve estar no formato AAAA-MM-DD.' };
  }
  return { value: rawValue };
}

/** Analisa um campo numérico opcional do body; retorna o valor atual se ausente/vazio. */
function parsePositiveNumberField(
  rawValue: unknown,
  currentValue: number,
): { value: number; error?: string } {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return { value: currentValue };
  }
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { value: currentValue, error: 'deve ser um número maior que zero.' };
  }
  return { value: parsed };
}

export function configRouter(configPath: string): Router {
  const router = Router();

  router.get('/config', async (_req, res) => {
    const config = await readConfig(configPath);
    res.json(toPublicConfig(config));
  });

  router.post('/config', async (req, res) => {
    const vertical = typeof req.body?.vertical === 'string' ? req.body.vertical.trim() : '';
    const jiraUsername = typeof req.body?.jiraUsername === 'string' ? req.body.jiraUsername.trim() : '';
    const jiraPasswordInput = typeof req.body?.jiraPassword === 'string' ? req.body.jiraPassword.trim() : '';

    if (!vertical || !jiraUsername) {
      res.status(400).json({ error: 'Informe a vertical e o usuário do Jira.' });
      return;
    }

    // Campo de senha em branco na edição mantém a senha já salva; na primeira configuração é obrigatório.
    const existing = await readConfig(configPath);
    const jiraPassword = jiraPasswordInput || existing.jiraPassword;
    if (!jiraPassword) {
      res.status(400).json({ error: 'Informe a senha do Jira.' });
      return;
    }

    const hoursPerDay = parsePositiveNumberField(req.body?.hoursPerDay, existing.hoursPerDay ?? DEFAULT_HOURS_PER_DAY);
    if (hoursPerDay.error) {
      res.status(400).json({ error: `Horas produtivas por dia ${hoursPerDay.error}` });
      return;
    }

    const dashDelayBar = req.body?.dashDelayBar === undefined ? (existing.dashDelayBar ?? false) : Boolean(req.body.dashDelayBar);

    const autoRefreshEnabled =
      req.body?.autoRefreshEnabled === undefined ? (existing.autoRefreshEnabled ?? true) : Boolean(req.body.autoRefreshEnabled);

    const next: AppConfig = {
      vertical,
      jiraUsername,
      jiraPassword,
      hoursPerDay: hoursPerDay.value,
      dashDelayBar,
      autoRefreshEnabled,
      sprintSettings: existing.sprintSettings,
    };
    await writeConfig(configPath, next);
    res.json(toPublicConfig(next));
  });

  return router;
}
