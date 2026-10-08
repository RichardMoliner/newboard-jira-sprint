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
  /** Apontamentos (worklog) lançados neste bug — somados nas horas de Implementação/Teste da atividade pai, conforme quem apontou. */
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
  /** Se a entrega ocorreu até a previsão; null quando ainda não foi concluída ou não há previsão para comparar. */
  deliveredOnTime: boolean | null;
  /** % de assertividade: horas apontadas (Implementação + Teste) vs. horas estimadas (PF × horas/PF); null até a tarefa ser concluída ou sem apontamento algum. */
  assertividadePercent: number | null;
  /** Mesma % de assertividade, mas somando também as horas apontadas em bugs (esforço real total, incluindo correções fora da estimativa original). */
  assertividadeComBugsPercent: number | null;
  status: string;
  isDone: boolean;
  isOverdue: boolean;
  /** True quando ainda não existe subtarefa de Implementação (o trabalho não começou de fato) e não está concluída. */
  notStarted: boolean;
  /** True quando a(s) subtarefa(s) de Implementação já estão "Atendida" (independente do status geral da story). */
  implDone: boolean;
  /** Data (YYYY-MM-DD) em que a Implementação foi disponibilizada para teste (última atualização da subtarefa quando implDone é true); null enquanto não está atendida. */
  implDoneDate: string | null;
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
  /** Soma de todos os apontamentos em bugs da atividade (sem separar por quem apontou); null quando não há bugs. */
  bugsLoggedHours: number | null;
  /** Horas de bug apontadas por quem tem papel de dev/tester na sprint (inferido, ver `inferRoles.ts`); apontamentos de quem não tem papel conhecido ficam de fora dos dois, mas continuam em `bugsLoggedHours`. Null quando não há bugs. */
  implBugsLoggedHours: number | null;
  testBugsLoggedHours: number | null;
  /** Todos os apontamentos das subtarefas de Implementação/Teste, para exibir no tooltip da atividade. */
  worklogEntries: WorklogEntry[];
  bugs: BugSubtask[];
  /** True quando a atividade entrou na sprint atual depois que ela já tinha começado (exclui herdadas — rolar de sprint não conta como adição nova). */
  addedAfterSprintStart: boolean;
  /** Timestamp ISO de quando a atividade entrou na sprint atual (via changelog do Jira); null quando não há esse histórico (ex: já criada dentro da sprint). */
  sprintEnteredAt: string | null;
  /** True quando a story carrega o rótulo "não-impacta-deploy" — pode ficar de fora de um deploy sem bloquear a publicação. */
  notImpactsDeploy: boolean;
  /** True quando a story carrega o rótulo "liberacao_antecipada" — foi entregue antes do previsto. */
  earlyDelivery: boolean;
  /** True quando a story carrega o rótulo "feature-flag" — foi liberada por trás de uma feature-flag. */
  featureFlag: boolean;
  /** Nome da exigência legal/regulatória que esta story atende (campo "Exigência" do Jira, ex.: "Lei 14.133/2021"). Null quando não é uma exigência legal. */
  legalRequirement: string | null;
  /** Data-limite (YYYY-MM-DD) de entrega da exigência (campo "Data final" do Jira). Pode ser null mesmo com legalRequirement preenchido — exigência conhecida, mas ainda sem prazo definido. */
  legalDeadline: string | null;
}

export interface SprintInfo {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  /** Timestamp ISO completo (não só a data) de início/fim da sprint — precisão de hora para comparar com o changelog de entrada na sprint. */
  startDateTime: string;
  endDateTime: string;
}

export interface BoardDataResponse {
  generatedAt: string;
  today: string;
  vertical: string;
  hoursPerDay: number;
  /** Horas por PF padrão do sistema — usado no client pra sprints sem configuração própria salva. */
  defaultHoursPerPf: number;
  /** % do tempo total (Implementação + Teste) assumido como Teste ao projetar a janela prevista (hoje fixo em 30%). */
  assumedTestSharePercent: number;
  sprints: SprintInfo[];
  activities: Activity[];
}
