import { computeAccuracyPercent } from './accuracy.js';
import { computeTimeline } from './timeline.js';
import { isDeliveredOnTime, isOverdue } from './status.js';
import type { Activity } from '../types.js';

/**
 * Recalcula os campos de uma atividade que dependem de horas/PF e horas/dia (janelas de
 * Implementação/Teste, prazo, assertividade, atraso) a partir dos dados já carregados do board —
 * sem precisar buscar nada de novo no Jira. Espelha a parte de server/src/domain/mapActivity.ts
 * que depende desses dois parâmetros; usada ao salvar as configurações de uma sprint.
 */
export function recomputeActivityForSprintSettings(
  activity: Activity,
  today: string,
  hoursPerPf: number,
  hoursPerDay: number,
): Activity {
  const timeline =
    !activity.notStarted && activity.storyPoints !== null
      ? computeTimeline(activity.storyPoints, activity.startDate, hoursPerPf, hoursPerDay)
      : null;
  const dueDate = timeline?.test.end ?? null;
  const implEstimatedHours = timeline?.implEstimatedHours ?? null;
  const testEstimatedHours = timeline?.testEstimatedHours ?? null;

  const functionallyDone = activity.isDone || activity.testDone;
  const totalLoggedHoursNoBugs =
    activity.implLoggedHours !== null || activity.testLoggedHours !== null
      ? (activity.implLoggedHours ?? 0) + (activity.testLoggedHours ?? 0)
      : null;
  const totalLoggedHoursWithBugs =
    totalLoggedHoursNoBugs !== null || activity.bugsLoggedHours !== null
      ? (totalLoggedHoursNoBugs ?? 0) + (activity.bugsLoggedHours ?? 0)
      : null;
  const assertividadePercent =
    functionallyDone && activity.storyPoints !== null && totalLoggedHoursNoBugs !== null
      ? computeAccuracyPercent(activity.storyPoints * hoursPerPf, totalLoggedHoursNoBugs)
      : null;
  const assertividadeComBugsPercent =
    functionallyDone && activity.storyPoints !== null && totalLoggedHoursWithBugs !== null
      ? computeAccuracyPercent(activity.storyPoints * hoursPerPf, totalLoggedHoursWithBugs)
      : null;

  return {
    ...activity,
    dueDate,
    deliveredOnTime: isDeliveredOnTime(activity.deliveredDate, dueDate),
    assertividadePercent,
    assertividadeComBugsPercent,
    isOverdue: isOverdue(dueDate, activity.isDone || activity.testDone, today),
    implWindow: timeline?.impl ?? null,
    testWindow: timeline?.test ?? null,
    implEstimatedHours,
    testEstimatedHours,
  };
}
