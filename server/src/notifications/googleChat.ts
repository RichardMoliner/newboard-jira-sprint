import { DueNotification } from './eligibility';

/**
 * Formats an early delivery notification into a message string for Google Chat.
 *
 * @param notification The DueNotification containing activity and milestone information
 * @returns Formatted message string with 4 lines: header, title, url, dev name
 */
export function formatEarlyDeliveryMessage(notification: DueNotification): string {
  const { activity, daysRemaining } = notification;

  let header: string;

  if (daysRemaining > 0) {
    header = `Liberação antecipada — faltam ${daysRemaining} dias`;
  } else if (daysRemaining === 0) {
    header = 'Liberação antecipada — é hoje';
  } else {
    header = 'Liberação antecipada — prazo já passou';
  }

  return `${header}\n${activity.title}\n${activity.url}\nDev: ${activity.developer}`;
}

/**
 * Sends a message to a Google Chat incoming webhook.
 *
 * @param webhookUrl The Google Chat webhook URL
 * @param text The message text to send
 * @returns A promise that resolves to { ok: true } on success or { ok: false, error: <message> } on failure
 */
export async function sendGoogleChatMessage(
  webhookUrl: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status} ${response.statusText}` };
    }

    return { ok: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { ok: false, error: errorMessage };
  }
}
