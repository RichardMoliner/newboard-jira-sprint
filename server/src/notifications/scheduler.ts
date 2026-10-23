import { readConfig } from '../config/configStore.js';
import { fetchBoardData } from '../jira/fetchBoardData.js';
import { computeDueNotifications } from './eligibility.js';
import { readNotifiedState, writeNotifiedState, recordNotified } from './notifiedStore.js';
import { formatEarlyDeliveryMessage, sendGoogleChatMessage } from './googleChat.js';

const EIGHT_AM_HOUR = 8;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Executa uma checagem de liberação antecipada: busca o board atual, calcula quais marcos de
 * notificação estão pendentes e envia cada um ao Google Chat do grupo correspondente, persistindo
 * o progresso a cada envio bem-sucedido (para não perder avanço se um envio posterior falhar).
 */
export async function runEarlyDeliveryCheck(configPath: string, notifiedStatePath: string): Promise<void> {
  const config = await readConfig(configPath);
  if (!config.vertical || !config.jiraUsername || !config.jiraPassword) {
    console.log('[scheduler] Configuração incompleta (vertical/usuário/senha do Jira) — checagem de liberação antecipada ignorada.');
    return;
  }

  const hoursPerPfBySprintId = Object.fromEntries(
    Object.entries(config.sprintSettings).map(([sprintId, settings]) => [sprintId, settings.hoursPerPf]),
  );
  const hoursPerDayBySprintId = Object.fromEntries(
    Object.entries(config.sprintSettings).map(([sprintId, settings]) => [sprintId, settings.hoursPerDay]),
  );

  const { today, activities } = await fetchBoardData(
    config.vertical,
    { username: config.jiraUsername, password: config.jiraPassword },
    hoursPerPfBySprintId,
    hoursPerDayBySprintId,
    config.hoursPerDay ?? undefined,
  );

  let state = await readNotifiedState(notifiedStatePath);
  const due = computeDueNotifications(activities, today, state);

  for (const notification of due) {
    const { activity } = notification;
    const group = config.sprintSettings[activity.sprintId]?.group ?? null;
    if (!group) {
      console.log(`Sprint ${activity.sprintId} sem grupo configurado — notificação de ${activity.key} ignorada.`);
      continue;
    }

    const webhookUrl = config.webhooks[group];
    if (!webhookUrl) {
      console.log(`Webhook de ${group} não configurado — notificação de ${activity.key} ignorada.`);
      continue;
    }

    const result = await sendGoogleChatMessage(webhookUrl, formatEarlyDeliveryMessage(notification));
    if (result.ok) {
      state = recordNotified(state, activity.key, activity.legalDeadline!, notification.milestone);
      await writeNotifiedState(notifiedStatePath, state);
    } else {
      console.error(`Falha ao enviar notificação de ${activity.key} (marco ${notification.milestone}) para o grupo ${group}:`, result.error);
    }
  }
}

function msUntilNextEightAm(now: Date): number {
  const next = new Date(now);
  next.setHours(EIGHT_AM_HOUR, 0, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - now.getTime();
}

/**
 * Agenda `runEarlyDeliveryCheck` para rodar todo dia às 08h — primeira execução no próximo 08h
 * (hoje, se ainda não passou, senão amanhã), e a partir daí a cada 24h.
 */
export function startDailyEarlyDeliveryCheck(configPath: string, notifiedStatePath: string): void {
  const delay = msUntilNextEightAm(new Date());

  setTimeout(() => {
    void runEarlyDeliveryCheck(configPath, notifiedStatePath).catch((err) => {
      console.error('[scheduler] Falha na checagem de liberação antecipada:', err);
    });
    setInterval(() => {
      void runEarlyDeliveryCheck(configPath, notifiedStatePath).catch((err) => {
        console.error('[scheduler] Falha na checagem de liberação antecipada:', err);
      });
    }, ONE_DAY_MS);
  }, delay);
}
