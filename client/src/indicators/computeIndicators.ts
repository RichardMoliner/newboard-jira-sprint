import type { Activity } from '../types.js';

export interface Kpis {
  totalActivities: number;
  totalStoryPoints: number;
  doneCount: number;
  atRiskCount: number;
  carriedCount: number;
  inProgressOnTimeCount: number;
  noEstimateCount: number;
  openBugsCount: number;
  bugsPerActivity: number;
}

export function computeKpis(activities: Activity[], _today: string): Kpis {
  const totalActivities = activities.length;
  const totalStoryPoints = sum(activities.map((a) => a.storyPoints ?? 0));
  const doneCount = count(activities, (a) => a.isDone);
  const atRiskCount = count(activities, (a) => a.isOverdue);
  const carriedCount = count(activities, (a) => a.isCarried);
  const noEstimateCount = count(activities, (a) => a.storyPoints === null);
  const inProgressOnTimeCount = count(activities, (a) => !a.isDone && !a.isOverdue);
  const openBugsCount = sum(activities.map((a) => a.bugs.length));

  return {
    totalActivities,
    totalStoryPoints,
    doneCount,
    atRiskCount,
    carriedCount,
    inProgressOnTimeCount,
    noEstimateCount,
    openBugsCount,
    bugsPerActivity: totalActivities === 0 ? 0 : openBugsCount / totalActivities,
  };
}

export interface PersonSummary {
  person: string;
  activities: number;
  storyPoints: number;
  bugs: number;
  done: number;
  atRisk: number;
  inProgress: number;
  noEstimate: number;
}

export function computePersonSummaries(activities: Activity[]): PersonSummary[] {
  const byPerson = new Map<string, PersonSummary>();

  for (const activity of activities) {
    const current = byPerson.get(activity.developer) ?? {
      person: activity.developer,
      activities: 0,
      storyPoints: 0,
      bugs: 0,
      done: 0,
      atRisk: 0,
      inProgress: 0,
      noEstimate: 0,
    };

    current.activities += 1;
    current.storyPoints += activity.storyPoints ?? 0;
    current.bugs += activity.bugs.length;
    if (activity.isDone) current.done += 1;
    if (activity.isOverdue) current.atRisk += 1;
    if (!activity.isDone && !activity.isOverdue) current.inProgress += 1;
    if (activity.storyPoints === null) current.noEstimate += 1;

    byPerson.set(activity.developer, current);
  }

  return [...byPerson.values()].sort((a, b) => b.storyPoints - a.storyPoints);
}

export interface SprintSummary {
  sprintName: string;
  activities: number;
  totalStoryPoints: number;
  bugs: number;
  done: number;
  atRisk: number;
}

export function computeSprintSummaries(activities: Activity[]): SprintSummary[] {
  const bySprint = new Map<string, SprintSummary>();

  for (const activity of activities) {
    const current = bySprint.get(activity.sprintName) ?? {
      sprintName: activity.sprintName,
      activities: 0,
      totalStoryPoints: 0,
      bugs: 0,
      done: 0,
      atRisk: 0,
    };

    current.activities += 1;
    current.totalStoryPoints += activity.storyPoints ?? 0;
    current.bugs += activity.bugs.length;
    if (activity.isDone) current.done += 1;
    if (activity.isOverdue) current.atRisk += 1;

    bySprint.set(activity.sprintName, current);
  }

  return [...bySprint.values()].sort((a, b) => b.totalStoryPoints - a.totalStoryPoints);
}

export interface TopBuggyActivity {
  key: string;
  title: string;
  sprintName: string;
  developer: string;
  bugCount: number;
}

export function topActivitiesByBugCount(activities: Activity[], limit: number): TopBuggyActivity[] {
  return activities
    .filter((a) => a.bugs.length > 0)
    .map((a) => ({ key: a.key, title: a.title, sprintName: a.sprintName, developer: a.developer, bugCount: a.bugs.length }))
    .sort((a, b) => b.bugCount - a.bugCount)
    .slice(0, limit);
}

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

function count(activities: Activity[], predicate: (a: Activity) => boolean): number {
  return activities.filter(predicate).length;
}
