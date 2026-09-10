export interface BugSubtask {
  key: string;
  title: string;
  developer: string | null;
  status: string;
  startDate: string;
  endDate: string;
}

export interface TimelineWindow {
  start: string;
  end: string;
}

export interface WorklogEntry {
  subtaskType: 'Implementação' | 'Teste';
  author: string;
  date: string;
  hours: number;
  comment: string | null;
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
  realizedBusinessDays: number | null;
  assertividadePercent: number | null;
  status: string;
  isDone: boolean;
  isOverdue: boolean;
  notStarted: boolean;
  implWindow: TimelineWindow | null;
  testWindow: TimelineWindow | null;
  implEstimatedHours: number | null;
  testEstimatedHours: number | null;
  implLoggedHours: number | null;
  testLoggedHours: number | null;
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
  sprints: SprintInfo[];
  activities: Activity[];
}
