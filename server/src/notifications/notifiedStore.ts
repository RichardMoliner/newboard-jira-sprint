import { readFile, rename, writeFile } from 'node:fs/promises';
import { NotifiedState, NotifiedEntry } from './eligibility';

/**
 * Reads the notified state from a JSON file.
 * Returns an empty object if the file doesn't exist or is corrupted.
 *
 * @param path Path to the notified.json file
 * @returns The current notified state
 */
export async function readNotifiedState(path: string): Promise<NotifiedState> {
  try {
    const raw = await readFile(path, 'utf-8');
    const parsed = JSON.parse(raw) as NotifiedState;
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT' || err instanceof SyntaxError) {
      return {};
    }
    throw err;
  }
}

/**
 * Writes the notified state to a JSON file using atomic write (tmp + rename).
 *
 * @param path Path to the notified.json file
 * @param state The state to persist
 */
export async function writeNotifiedState(path: string, state: NotifiedState): Promise<void> {
  const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmpPath, JSON.stringify(state, null, 2) + '\n', 'utf-8');
  await rename(tmpPath, path);
}

/**
 * Records that a milestone notification has been sent for an activity.
 * Returns a new state object (immutable — does not mutate the input).
 *
 * If the legalDeadline has changed, resets the milestones list.
 * If the legalDeadline is the same, appends the milestone to the list.
 *
 * @param state Current notification state
 * @param issueKey Activity key
 * @param legalDeadline Current legalDeadline of the activity
 * @param milestone Milestone to record (5, 3, 1, or 0)
 * @returns New state with the milestone recorded
 */
export function recordNotified(
  state: NotifiedState,
  issueKey: string,
  legalDeadline: string,
  milestone: number,
): NotifiedState {
  const entry = state[issueKey];

  // If the entry doesn't exist or the deadline has changed, start fresh
  if (!entry || entry.legalDeadline !== legalDeadline) {
    return {
      ...state,
      [issueKey]: {
        legalDeadline,
        milestones: [milestone],
      },
    };
  }

  // Deadline is the same, append milestone to the list
  return {
    ...state,
    [issueKey]: {
      legalDeadline,
      milestones: [...entry.milestones, milestone],
    },
  };
}
