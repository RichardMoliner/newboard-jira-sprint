export interface WorklogEntry {
  subtaskType: 'Implementação' | 'Teste' | 'Bug';
  author: string;
  date: string;
  hours: number;
  comment: string | null;
}

export interface BugSubtask {
  key: string;
  title: string;
  developer: string | null;
  status: string;
  startDate: string;
  endDate: string;
  worklogEntries: WorklogEntry[];
  /** Artefato do bug (customfield_10232 no Jira): se foi gerado no requisito ou na solução/dev. Null quando não preenchido ou com valor não reconhecido. */
  artifact: 'requisito' | 'implementacao' | null;
  /** Rótulos (labels) do bug no Jira, ex.: bug_devolvido, bug_impeditivo. Pode ter mais de um. */
  labels: string[];
}

export interface TimelineWindow {
  start: string;
  end: string;
}

export interface Activity {
  key: string;
  url: string;
  title: string;
  sprintId: string;
  sprintName: string;
  isCarried: boolean;
  developer: string;
  tester: string | null;
  storyPoints: number | null;
  startDate: string;
  dueDate: string | null;
  deliveredDate: string | null;
  deliveredOnTime: boolean | null;
  assertividadePercent: number | null;
  assertividadeComBugsPercent: number | null;
  status: string;
  isDone: boolean;
  isOverdue: boolean;
  notStarted: boolean;
  implDone: boolean;
  implDoneDate: string | null;
  testDone: boolean;
  implWindow: TimelineWindow | null;
  testWindow: TimelineWindow | null;
  implEstimatedHours: number | null;
  testEstimatedHours: number | null;
  implLoggedHours: number | null;
  testLoggedHours: number | null;
  bugsLoggedHours: number | null;
  implBugsLoggedHours: number | null;
  testBugsLoggedHours: number | null;
  worklogEntries: WorklogEntry[];
  bugs: BugSubtask[];
  addedAfterSprintStart: boolean;
  sprintEnteredAt: string | null;
}

export interface SprintInfo {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  startDateTime: string;
  endDateTime: string;
}

export interface BoardDataResponse {
  generatedAt: string;
  today: string;
  vertical: string;
  hoursPerPf: number;
  hoursPerDay: number;
  /** % do tempo total (Implementação + Teste) assumido como Teste ao projetar a janela prevista (hoje fixo em 30%). */
  assumedTestSharePercent: number;
  sprints: SprintInfo[];
  activities: Activity[];
}
