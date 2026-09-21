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
  worklogEntries: WorklogEntry[];
  bugs: BugSubtask[];
}

export interface SprintInfo {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
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
