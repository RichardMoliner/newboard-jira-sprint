import { Router } from 'express';
import { readConfig, writeConfig, type AppConfig } from '../config/configStore.js';
import { DEFAULT_HOURS_PER_PF, DEFAULT_HOURS_PER_DAY } from '../compute/timeline.js';

function toPublicConfig(config: AppConfig) {
  // Nunca devolve a senha em texto puro para o cliente — só se ela já está configurada.
  return {
    vertical: config.vertical,
    jiraUsername: config.jiraUsername,
    jiraPasswordSet: Boolean(config.jiraPassword),
    hoursPerPf: config.hoursPerPf ?? DEFAULT_HOURS_PER_PF,
    hoursPerDay: config.hoursPerDay ?? DEFAULT_HOURS_PER_DAY,
    dashDelayBar: config.dashDelayBar ?? false,
    lastPublishDay: config.lastPublishDay ?? null,
    lastTestDay: config.lastTestDay ?? null,
    publishDay: config.publishDay ?? null,
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

    const hoursPerPf = parsePositiveNumberField(req.body?.hoursPerPf, existing.hoursPerPf ?? DEFAULT_HOURS_PER_PF);
    if (hoursPerPf.error) {
      res.status(400).json({ error: `Horas por PF ${hoursPerPf.error}` });
      return;
    }

    const hoursPerDay = parsePositiveNumberField(req.body?.hoursPerDay, existing.hoursPerDay ?? DEFAULT_HOURS_PER_DAY);
    if (hoursPerDay.error) {
      res.status(400).json({ error: `Horas produtivas por dia ${hoursPerDay.error}` });
      return;
    }

    const dashDelayBar = req.body?.dashDelayBar === undefined ? (existing.dashDelayBar ?? false) : Boolean(req.body.dashDelayBar);

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

    const next = {
      vertical,
      jiraUsername,
      jiraPassword,
      hoursPerPf: hoursPerPf.value,
      hoursPerDay: hoursPerDay.value,
      dashDelayBar,
      lastPublishDay: lastPublishDay.value,
      lastTestDay: lastTestDay.value,
      publishDay: publishDay.value,
    };
    await writeConfig(configPath, next);
    res.json(toPublicConfig(next));
  });

  return router;
}
