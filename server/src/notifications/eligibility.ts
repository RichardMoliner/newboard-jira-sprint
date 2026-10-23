import { Activity } from '../domain/types.js';

export interface NotifiedEntry {
  legalDeadline: string;
  milestones: number[];
}

export type NotifiedState = Record<string, NotifiedEntry>;

export interface DueNotification {
  activity: Activity;
  milestone: number; // 5 | 3 | 1 | 0
  daysRemaining: number;
}

export const MILESTONES: number[] = [5, 3, 1, 0];

/**
 * Checks if an activity is eligible for early-release notifications.
 *
 * Eligible when:
 * - Has earlyDelivery flag set to true
 * - Has a legalDeadline defined
 * - Is NOT in testDone state (Aguardando liberação)
 * - Is NOT isDone (Atendida)
 */
export function isEligibleForEarlyDeliveryNotification(activity: Activity): boolean {
  return (
    activity.earlyDelivery &&
    activity.legalDeadline !== null &&
    !activity.testDone &&
    !activity.isDone
  );
}

/**
 * Calculates the number of days between two dates (in YYYY-MM-DD format).
 *
 * @param fromDateOnly Start date in YYYY-MM-DD format
 * @param toDateOnly End date in YYYY-MM-DD format
 * @returns Number of calendar days (toDate - fromDate). Can be negative if toDate is before fromDate.
 */
export function daysBetween(fromDateOnly: string, toDateOnly: string): number {
  const from = new Date(fromDateOnly);
  const to = new Date(toDateOnly);
  const diffMs = to.getTime() - from.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Gets the list of milestones already notified for an activity's current legalDeadline.
 *
 * Returns the milestones only if the stored legalDeadline matches the current one.
 * If the legalDeadline has changed, returns empty array (milestones are no longer valid).
 *
 * @param state Current notification state
 * @param issueKey Activity key to look up
 * @param legalDeadline Current legalDeadline of the activity
 * @returns Array of milestone numbers already notified for this deadline
 */
export function getNotifiedMilestones(
  state: NotifiedState,
  issueKey: string,
  legalDeadline: string,
): number[] {
  const entry = state[issueKey];
  if (!entry) {
    return [];
  }
  if (entry.legalDeadline !== legalDeadline) {
    return [];
  }
  return entry.milestones;
}

/**
 * Computes which notification milestones are due for each eligible activity.
 *
 * For each eligible activity:
 * 1. Calculate daysRemaining = daysBetween(today, activity.legalDeadline)
 * 2. Determine reached milestones:
 *    - If daysRemaining < 0: only [0]
 *    - Otherwise: all MILESTONES where daysRemaining <= milestone
 * 3. Filter out milestones already notified for this deadline
 * 4. Sort pending milestones from largest to smallest (5 -> 3 -> 1 -> 0)
 * 5. Create a DueNotification for each pending milestone
 *
 * @param activities Array of activities to check
 * @param today Current date in YYYY-MM-DD format
 * @param state Current notification state
 * @returns Array of DueNotification objects, ordered by milestone (descending)
 */
export function computeDueNotifications(
  activities: Activity[],
  today: string,
  state: NotifiedState,
): DueNotification[] {
  const notifications: DueNotification[] = [];

  for (const activity of activities) {
    // Skip if not eligible
    if (!isEligibleForEarlyDeliveryNotification(activity)) {
      continue;
    }

    const daysRemaining = daysBetween(today, activity.legalDeadline!);

    // Determine which milestones have been reached
    let reachedMilestones: number[];
    if (daysRemaining < 0) {
      // Deadline has passed
      reachedMilestones = [0];
    } else {
      // Filter milestones where daysRemaining <= milestone
      reachedMilestones = MILESTONES.filter((m) => daysRemaining <= m);
    }

    // Get previously notified milestones for this activity's current deadline
    const notifiedMilestones = getNotifiedMilestones(state, activity.key, activity.legalDeadline!);

    // Find pending milestones (reached but not yet notified)
    const pendingMilestones = reachedMilestones.filter((m) => !notifiedMilestones.includes(m));

    // Sort pending milestones from largest to smallest
    pendingMilestones.sort((a, b) => b - a);

    // Create a DueNotification for each pending milestone
    for (const milestone of pendingMilestones) {
      notifications.push({
        activity,
        milestone,
        daysRemaining,
      });
    }
  }

  return notifications;
}
