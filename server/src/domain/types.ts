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
  /** Se a entrega ocorreu até a previsão; null quando ainda não foi concluída ou não há previsão para comparar. */
  deliveredOnTime: boolean | null;
  /** % de assertividade: horas apontadas (Implementação + Teste) vs. horas estimadas (PF × horas/PF); null até a tarefa ser concluída ou sem apontamento algum. */
  assertividadePercent: number | null;
  status: string;
  isDone: boolean;
  isOverdue: boolean;
  /** True quando ainda não existe subtarefa de Implementação (o trabalho não começou de fato) e não está concluída. */
  notStarted: boolean;
  /** True quando a(s) subtarefa(s) de Implementação já estão "Atendida" (independente do status geral da story). */
  implDone: boolean;
  /** True quando a(s) subtarefa(s) de Teste já estão "Atendida" (independente do status geral da story). */
  testDone: boolean;
  implWindow: TimelineWindow | null;
  testWindow: TimelineWindow | null;
  /** Horas úteis previstas para implementação/teste (dias úteis da janela × horas/dia); null sem estimativa. */
  implEstimatedHours: number | null;
  testEstimatedHours: number | null;
  /** Horas realmente apontadas (worklog) nas subtarefas de Implementação/Teste; null quando a subtarefa ainda não existe. */
  implLoggedHours: number | null;
  testLoggedHours: number | null;
  /** Todos os apontamentos das subtarefas de Implementação/Teste, para exibir no tooltip da atividade. */
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
  /** Produtividade usada nas previsões desta resposta — para a visualização analítica (por hora) no client. */
  hoursPerPf: number;
  hoursPerDay: number;
  sprints: SprintInfo[];
  activities: Activity[];
}
