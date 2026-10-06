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
  /** Link direto para o bug no Jira. */
  url: string;
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
  /** True quando a story carrega o rótulo "não-impacta-deploy" — pode ficar de fora de um deploy sem bloquear a publicação. */
  notImpactsDeploy: boolean;
  /** Nome da exigência legal/regulatória que esta story atende (ex.: "Lei 14.133/2021"). Null quando não é uma exigência legal. */
  legalRequirement: string | null;
  /** Data-limite (YYYY-MM-DD) de entrega da exigência ("Data final" no Jira). Pode ser null mesmo com legalRequirement preenchido. */
  legalDeadline: string | null;
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
  hoursPerDay: number;
  /** Horas por PF padrão do sistema — usado como fallback pra sprints sem configuração própria salva. */
  defaultHoursPerPf: number;
  /** % do tempo total (Implementação + Teste) assumido como Teste ao projetar a janela prevista (hoje fixo em 30%). */
  assumedTestSharePercent: number;
  sprints: SprintInfo[];
  activities: Activity[];
}

/** Configuração por sprint (horas/PF e prazos), chaveada pelo id da sprint no Jira — sem entrada
 * aqui, a sprint usa o padrão do sistema pra horas/PF e não tem nenhuma régua de prazo. */
export interface SprintSettings {
  hoursPerPf: number | null;
  lastPublishDay: string | null;
  lastTestDay: string | null;
  publishDay: string | null;
}
