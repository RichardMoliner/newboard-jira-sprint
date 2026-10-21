# Tempo por status: modal por story + gráfico de gargalo nos Indicadores

## Intenção e porquê

Hoje o painel mostra o status atual de cada story (badge na Timeline, pizza "Atividades por
status" nos Indicadores), mas não quanto tempo ela ficou em cada status ao longo do fluxo. O
coordenador quer essa visibilidade por dois motivos:

1. **Por story**: entender rapidamente onde uma atividade específica está "travada" ou por onde
   ela passou, sem precisar abrir o Jira e vasculhar o changelog manualmente.
2. **Agregado**: identificar o gargalo recorrente do fluxo (ex.: "as stories passam muito tempo
   esperando code review") olhando a média de % de tempo gasto em cada status nas tarefas já
   concluídas.

## Goals

- Um ícone informativo (ℹ️) em cada story na Timeline abre uma modal listando: status → tempo
  gasto nele, cobrindo a vida inteira da story (inclusive antes da sprint atual, se ela foi
  herdada).
- Um novo gráfico na aba Indicadores mostrando a % média de tempo gasto em cada status,
  considerando só as stories já concluídas no recorte atual (mesmo filtro de sprint/atividades já
  usado pelos outros indicadores).
- Os status considerados são exatamente os que o painel já trata como "canônicos" hoje (ver
  `STATUS_ORDER` em `computeIndicators.ts` e a lógica de status derivado em `mapActivity.ts`):
  Ainda não iniciada, Em andamento, Em code review, Ag. início dos testes, Em testes, Aguardando
  liberação, Concluída (terminal — ver decisão abaixo sobre não entrar no gráfico de %).

## Non-goals

- Não é um CFD (cumulative flow diagram) nem qualquer gráfico de fluxo cumulativo por dia — isso
  foi discutido como viável, mas não faz parte deste pedido.
- Não inclui tarefas em andamento (não concluídas) no gráfico de % do Indicadores — só no modal
  individual (que funciona pra qualquer story, concluída ou não).
- Não recalcula/substitui o status "ao vivo" já exibido na Timeline — isso continua como está;
  o que muda é que agora também guardamos por quanto tempo cada status anterior durou.

## Decisões já tomadas na conversa

- **Fonte dos status**: os status "derivados" que o painel já usa (não o status bruto do Jira em
  todas as fases) — ver mapeamento técnico abaixo.
- **Stories herdadas**: o tempo em cada status conta desde quando aquele status realmente começou
  (mesmo em sprint anterior), não só a partir da entrada na sprint atual.
- **Gráfico de %**: só com stories concluídas (ciclo completo) — tarefas em andamento distorceriam
  a % (o ciclo delas ainda não fechou) e foram propositalmente deixadas de fora.
- **Em code review**: vale a pena buscar o changelog da própria subtarefa de Implementação (não só
  da story-mãe) pra saber a data exata em que ela entrou em "Aguardando liberação para testes" —
  custo aceito: mais uma chamada HTTP ao Jira por subtarefa de Implementação, com cache (mesmo
  padrão de `getIssueHistoryFacts`, por `updated`).

## Mapeamento técnico: como reconstruir a timeline de status de uma story

Isso é o "como" central do projeto — decisão minha (a ser validada no builder-check), já que
replica a lógica de status derivado de `mapActivity.ts` (linhas ~169-179), só que guardando
*quando* cada fase começou/terminou, não só o status atual:

| # | Status                  | Início                                                                 | Fim                                                                   |
|---|--------------------------|-------------------------------------------------------------------------|-------------------------------------------------------------------------|
| 1 | Ainda não iniciada       | `story.created` (data de criação da issue no Jira)                      | `implStartDate` (já calculado em `groupSubtasks.ts`)                   |
| 2 | Em andamento             | `implStartDate`                                                          | data em que a subtarefa de Implementação entrou em "Aguardando liberação para testes" (**novo**, via changelog da subtarefa) — se nunca passou por lá, até `implDoneDate` |
| 3 | Em code review           | data do item 2 (se existiu)                                             | `implDoneDate`                                                         |
| 4 | Ag. início dos testes    | `implDoneDate`                                                           | data do primeiro apontamento (worklog) na subtarefa de Teste — se não houver, até `testDoneDate` |
| 5 | Em testes                | data do primeiro apontamento de Teste (se existiu)                      | `testDoneDate`                                                         |
| 6 | Aguardando liberação     | `testDoneDate`                                                           | `doneTransitionDate` (changelog da story — já existe em `fetchSprintEntry.ts`) ou `story.updated` como fallback |
| 7 | Concluída                | `doneTransitionDate`                                                     | (terminal — sem duração relevante, não entra no gráfico de %)          |

Fases que não se aplicam a uma story específica (ex.: pulou direto pra "Atendida" sem passar por
code review) simplesmente não geram segmento. Para uma story ainda em andamento, o último segmento
fica em aberto (fim = agora) — relevante pro modal, irrelevante pro gráfico (que só usa concluídas).

**Múltiplas subtarefas de Implementação** (`implStatusesByParent` já lida com isso via `every()`):
`implAwaitingCodeReviewByParent` só é `true` quando *todas* as subtarefas estão em "Aguardando
liberação para testes" — pra ser consistente com esse "todas", a transição "Em andamento → Em code
review" usa a **data mais tardia (máx.)** entre as subtarefas (só vira code review de fato quando a
última delas chegou lá). Minha decisão, pra manter coerência com o `.every()` já existente.

**Review reaberta (subtarefa volta e entra de novo em "Aguardando liberação para testes")**: usa a
**primeira** ocorrência dessa transição, não a mais recente. O modelo de 7 fases é linear (um
segmento por status, sem voltar atrás) — indas e vindas entre "Em andamento" e "Em code review"
ficam contabilizadas dentro do mesmo segmento "Em code review" (do primeiro instante em que entrou
lá até `implDoneDate`), em vez de criar segmentos extras. Minha decisão; diferente do padrão usado
em `findDoneTransitionDate` (que pega a mais recente) porque ali o objetivo é outro — achar a data
real da transição *atual*, não o início de uma fase num histórico linear.

## Granularidade e unidade de tempo

- Duração em **dias corridos** (não dias úteis) — o tempo parado esperando liberação numa
  sexta-feira até segunda é tempo real de espera, não deveria ser mascarado pela mesma lógica de
  dias úteis usada nas previsões de prazo. Isso é uma escolha deliberada, diferente do resto do
  app (que usa dias úteis pra projeção) — o builder-check deve confirmar que faz sentido.
- Os pontos de corte que já existem no app são só data (`YYYY-MM-DD`, ex. `implStartDate`,
  `implDoneDate`, `testDoneDate`); os novos (data de "Em code review", `story.created`) devem ser
  truncados pra data também, pra manter consistência de granularidade entre os 7 segmentos (não
  faz sentido misturar segmento com precisão de hora ao lado de outro só com precisão de dia).

## O que conta como "concluída" pro gráfico de %

O gráfico de % só usa stories com um ciclo totalmente fechado — ou seja, com os 7 segmentos da
tabela completos, o que só acontece quando `isDone` é `true` (gera `doneTransitionDate`, fecha o
segmento 6 "Aguardando liberação" e abre o 7 "Concluída"). Isso é **diferente** do `isCompleted`
usado no resto de `computeIndicators.ts` (`isDone || testDone`) — uma story só `testDone` ainda tem
o segmento "Aguardando liberação" em aberto (sem data de fim real), então entraria no gráfico com um
ciclo incompleto se usássemos `isCompleted`. Decisão minha: usar `isDone` sozinho aqui, mesmo
divergindo da convenção do resto do arquivo — o builder não deve reusar `isCompleted` por reflexo
pra este cálculo específico.

## Cache de sprints fechadas já existente

Sprints fechadas que já estão cacheadas em disco (`sprintCache.ts`) hoje foram salvas sem
`statusHistory`. Decisão: **invalidar esse cache uma vez** quando esta funcionalidade for
lançada (ex.: bump de versão no cache ou limpeza do diretório), forçando todas as sprints fechadas
já consultadas a buscarem de novo no Jira na próxima vez que alguém abrir o Histórico — mais lento
na primeira consulta de cada uma depois do deploy, mas o gráfico de % já nasce com a amostra
completa, sem sprints "invisíveis" por terem sido cacheadas antes da mudança.

## Constraints

- Reusar o padrão de fetch+cache de changelog já existente em `fetchSprintEntry.ts`
  (`getIssueHistoryFacts`) em vez de criar um mecanismo paralelo — a nova chamada por subtarefa de
  Implementação deve seguir a mesma ideia (cache em memória por `updated` da subtarefa).
- Isso é mais uma chamada HTTP ao Jira por subtarefa de Implementação buscada (board ao vivo e
  Histórico) — aceito pelo usuário, mas o builder deve confirmar que não estoura limites de
  concorrência já configurados (`CHANGELOG_CONCURRENCY` em `fetchBoardData.ts`).
- Sprints já fechadas no Histórico são cacheadas em disco (`sprintCache.ts`) — o novo campo
  (`statusHistory`) precisa fazer parte do que é cacheado, senão o Histórico não vai ter essa
  informação pra sprints já cacheadas antes dessa mudança (cache antiga sem o campo deve ser
  tratada como "sem dados" pro status history, não quebrar).

## O que fica a cargo de quem for construir

- Nome exato dos novos campos/tipos (`Activity.statusHistory`, interface do segmento, etc.) —
  seguir a convenção de nomenclatura já usada no arquivo (`domain/types.ts` / `client/src/types.ts`).
- Onde exatamente o ícone ℹ️ entra na linha da story na Timeline (mesmo padrão visual da ⚙️ que já
  abre `SprintSettingsPopup` — ver `TimelineView.tsx` por volta da linha 1417/1561) e o componente
  da modal em si (pode seguir o estilo de `SprintSettingsPopup.tsx`).
- Nome e local do novo componente de gráfico nos Indicadores (ex.: `StatusBottleneckChart.tsx`,
  ao lado de `StatusPieChart.tsx`/`BurndownChart.tsx`) — **antes de desenhar, carregar a skill
  `dataviz`** (já disponível no projeto) pra manter consistência visual com os outros gráficos.
  Tipo de gráfico sugerido: barras horizontais, uma por status, ordenadas pela ordem natural do
  fluxo (mesma ordem da tabela acima, sem "Concluída").
  Decisão sugerida (meu call, mas justificado): nenhum peso por tamanho da story — cada story
  concluída conta sua % igualmente (média simples das %), não ponderada por story points, porque
  o que se quer enxergar é "formato" típico do fluxo, não o volume de esforço.
- Formato de exibição do tempo (modal e gráfico) — sugiro dias com uma casa decimal quando fizer
  sentido (ex.: "2,5 dias"), mas isso é detalhe de apresentação.
- Testes: seguir TDD como já é convenção no projeto (ver `*.test.ts` ao lado de cada módulo
  tocado).
