# Projeção da próxima tarefa na fila — Linha do tempo

## Intenção e por quê

Hoje, na Linha do tempo, cada dev só mostra barras reais para tarefas que já têm
subtarefa de Implementação. Uma tarefa "Ainda não iniciada" (mesmo já atribuída
ao dev e com Pontos de Função definidos) fica sem nenhuma representação visual
de prazo, e o texto "Disponível a partir de" (mostrado quando o dev está ocupado)
também ignora completamente esse trabalho futuro — só soma a tarefa em
andamento.

Exemplo motivador: Guilherme Henrique Gibim de Mello está em "COM-68467" (Impl.
em andamento) e tem "COM-68465" (16 PF) na fila, ainda não iniciada. Hoje o
painel mostra "Disponível a partir de 13/11" olhando só pra COM-68467 — não dá
pra saber quando ele realmente fica livre de tudo que já está na fila dele.

O objetivo é projetar, só para a **próxima** tarefa ainda não iniciada de cada
dev (a primeira da fila), uma barra na Linha do tempo mostrando quando ela
deve rodar — e atualizar o texto de disponibilidade do dev pra refletir esse
trabalho futuro também.

## Goals

- Para cada developer, identificar a "próxima" atividade ainda não iniciada
  (`activity.notStarted === true`) na ordem em que aparece hoje no board.
- Projetar, só para essa atividade, uma janela de Implementação (início/fim)
  a partir de quando o dev projeta ficar livre do trabalho real já em
  andamento, usando a mesma fórmula de PF → horas → dias úteis já usada em
  `computeTimeline` (70% Impl. / 30% Teste).
- Renderizar essa janela como uma barra tracejada (contorno, sem
  preenchimento), na cor do Impl. (`var(--series-impl)`), com o texto
  "PROJEÇÃO" dentro — opção A validada no protótipo visual.
- O texto hoje chamado "Disponível a partir de" passa a se chamar **"Projeção
  de disponibilidade em"** e passa a considerar essa próxima tarefa projetada:
  a data mostrada é o fim da janela projetada (quando existe uma próxima
  tarefa), não mais só o fim do trabalho atualmente em andamento.
- Reordenação automática e sem estado: se o dev pegar uma tarefa que não é a
  primeira da fila (pulou a ordem), a tarefa pulada deixa de ser "a próxima" —
  o cálculo já reflete isso na próxima atualização do board, sem precisar de
  nenhum registro manual de quem pulou o quê (ver regra de ordenação abaixo).

## Non-goals

- Não vamos projetar a fila inteira (2ª, 3ª tarefa em diante) — só a próxima
  imediata, uma barra por dev.
- Não vamos mudar o "✓ Disponível"/tag de bug em devs que já estão livres de
  trabalho em andamento. Ver anti-goal abaixo sobre o caso de dev livre com
  fila pendente.
- Não vamos considerar a fase de Teste na projeção — só Implementação, do
  mesmo jeito que `isDeveloperAvailable`/`projectDeveloperAvailabilityDate`
  já só olham Impl. hoje (esperar o teste não ocupa o dev).
- Não vamos persistir nem registrar historicamente qual tarefa foi "pulada" —
  é um cálculo derivado do snapshot atual dos dados, recalculado do zero a
  cada fetch do board, igual a todo o resto do motor de cálculo deste painel.

## Anti-goals (seria falha mesmo funcionando)

- Mostrar a barra projetada para uma tarefa que não é realmente a próxima da
  fila (ex.: projetar uma que já foi pulada, ou pular a que de fato é a
  próxima).
- Quebrar o "Disponível a partir de"/"Projeção de disponibilidade em" para
  devs sem nenhuma tarefa não iniciada na fila — esse caso deve continuar
  idêntico ao comportamento atual (sem a mudança).
- **Caso em aberto, tratado como não-goal por ora**: um dev totalmente livre
  (sem Impl. em andamento) mas com uma tarefa não iniciada na fila continua
  sem mostrar "✓ Disponível" + data de projeção ao mesmo tempo — por ora,
  mantemos o comportamento atual (sem label de projeção) nesse caso. Avaliar
  separadamente depois se isso for pedido.

## Decisão adicional (pós builder-check): fila calculada entre sprints vs. linha visível

A fila/"próxima tarefa" é calculada a partir de **todas** as atividades do dev
entre sprints (`byDeveloperAcrossAllSprints`), igual já acontece hoje com
`projectDeveloperAvailabilityDate` — isso é proposital, pra não mostrar o dev
como "disponível" só porque a tarefa em andamento dele ficou de fora do filtro
de sprint atual. Isso significa que a tarefa identificada como "próxima" pode,
em alguns momentos, não ter uma linha visível no momento (filtro de sprint,
busca por texto, "Ocultar concluídas", filtros da legenda) mesmo com o dev
tendo outras linhas visíveis.

Regra adotada: o texto "Projeção de disponibilidade em" continua vindo sempre
do cálculo entre sprints (consistente com o "Disponível a partir de" de hoje,
que já ignora o filtro de sprint). A barra tracejada em si, porém, só é
desenhada quando a atividade identificada como "próxima" estiver entre as
linhas atualmente renderizadas daquele dev (`items` pós-filtro) — se não
estiver, simplesmente não há barra pra desenhar nesse momento (sem erro, sem
fallback visual). Ou seja: o texto pode, em casos raros de filtro, não ter uma
barra correspondente visível — aceitável, já que o texto sozinho continua
informativo e nada quebra.

## Constraints

- Reusar `computeTimeline(storyPoints, startISO, hoursPerPf, hoursPerDay)` (já
  existe em `client/src/compute/timeline.ts`, espelhando o server) para
  calcular a janela projetada — não reinventar a fórmula de dias úteis/70-30.
- `hoursPerPf` usado na projeção deve ser o da sprint da própria atividade
  projetada (`sprintSettingsById[activity.sprintId]?.hoursPerPf`, com fallback
  pro default da vertical), não um valor global fixo — mesmo padrão já usado
  em `hoursPerPfBySprintId` (`BoardScreen.tsx:62-64`).
- A barra projetada só aparece para atividades com `notStarted === true` e
  `storyPoints !== null` (sem PF não dá pra projetar nada — fica sem barra,
  igual hoje).
- A lógica de projeção em si (ordenação, regra de "pulou a fila", janela
  projetada) é puramente client-side e derivada — o server continua sem saber
  de "projeção"; é um cálculo de apresentação, igual
  `projectDeveloperAvailabilityDate` já é hoje.
- **Exceção, descoberta no planejamento**: a regra de "pulou a fila" (ver
  decisão abaixo) precisa comparar a data de CRIAÇÃO de uma atividade não
  iniciada com a data de criação de uma atividade do mesmo dev que já foi
  iniciada — mas `Activity.startDate` muda de significado quando a
  implementação começa (passa a ser a data real de início, não mais a de
  criação; só para atividades ainda não iniciadas ele reflete a criação, ver
  `mapActivity.ts:176`). Isso exige um campo novo, só-leitura,
  `Activity.createdDate: string` (sempre a data de criação da story,
  independente do status), exposto em `mapActivity.ts`/`domain/types.ts` a
  partir de `story.created` — já buscado hoje, sem custo extra de API. Com
  isso, a única mudança no servidor é esse campo adicional; nenhuma lógica de
  projeção propriamente dita entra no server.

## Decisões já tomadas (na conversa)

- **Ordenação da fila**: a ordem "do board" de hoje (ver `groupByDeveloper` em
  `TimelineView.tsx:2360`) já ordena concluídas primeiro, depois por
  `startDate`, e as não iniciadas sempre por último, ordenadas entre si por
  `startDate` (que para elas é a data de criação da story, `dateOnly(story.created)` — ver `mapActivity.ts:176`). Essa ordem continua sendo a base da fila.
- **Regra do "pulou a fila"**: uma atividade não iniciada `A` do dev é
  considerada **pulada** quando existe outra atividade `B` do MESMO dev que já
  foi iniciada (`B.notStarted === false`, isto é, já tem subtarefa de
  Implementação) e cuja data de criação é POSTERIOR à data de criação de `A`.
  Isso significa que o dev pegou algo criado depois de `A` antes de pegar a
  própria `A`. Atividades puladas vão para o final da sub-fila de não
  iniciadas (depois das não puladas), mantendo a ordem por data de criação
  dentro de cada grupo (puladas / não puladas). A "próxima" tarefa projetada é
  sempre a primeira dessa fila reordenada.
- **Âncora de início da projeção**: a mesma lógica de
  `projectDeveloperAvailabilityDate` hoje (soma de horas de Impl. restantes
  das atividades realmente em andamento do dev, projetada em dias úteis a
  partir de hoje) continua valendo para achar quando o dev fica livre do
  trabalho REAL. Essa data vira o `startISO` passado pra `computeTimeline` da
  próxima tarefa da fila. Se o dev não tem nenhuma atividade em andamento
  (já está livre hoje), a âncora é hoje mesmo — mas pelo anti-goal acima, esse
  caso por ora não exibe a barra/label (fica para avaliação futura).
- **Renomeação do label**: "Disponível a partir de" → "Projeção de
  disponibilidade em", sempre que houver uma próxima tarefa a projetar (texto
  mostra o fim da janela projetada dela). Sem próxima tarefa na fila, mantém o
  comportamento atual (continua chamado como hoje, só com o trabalho em
  andamento — **a cargo do builder confirmar se o label muda de nome mesmo
  nesse caso, para manter consistência de nomenclatura, ou se só muda quando
  há projeção real** — ver seção "a cargo do builder").
- **Estilo visual**: opção A validada no protótipo — contorno tracejado na
  cor `var(--series-impl)`, sem preenchimento, com o texto "PROJEÇÃO" centralizado
  dentro da barra (fonte pequena, mesma família usada em outros labels da
  Linha do tempo).

## O que fica a cargo do builder

- Decidir se "Projeção de disponibilidade em" é o novo nome do label em TODOS
  os casos (mesmo sem fila, só com trabalho em andamento) ou só quando há de
  fato uma tarefa projetada — recomendação: trocar o nome sempre, pra não ter
  dois textos diferentes pro mesmo conceito; mas confirmar que não há uso
  do texto antigo em outro lugar (ex. testes, `grep` por "Disponível a partir").
- Onde exatamente threadar o novo prop `hoursPerPfBySprintId` (ou equivalente)
  do `BoardScreen.tsx` até `TimelineView` → função de projeção — `BoardScreen`
  já calcula isso para `IndicatorsView`/`HistoryView`/`ReportView`
  (`hoursPerPfBySprintId` memo, linha ~62), só falta passar pra
  `TimelineView` também.
- Implementação exata da função de reordenação da fila (ex.
  `resolveNextQueuedActivity(activities: Activity[]): Activity | null`) e de
  onde ela entra no fluxo hoje existente em `groupByDeveloper`/
  `projectDeveloperAvailabilityDate` — decidir se vira uma função nova
  separada ou se extende as existentes; manter puramente funcional e testável
  como o resto do arquivo (seguir o padrão de testes de
  `TimelineView.test.ts`, TDD como já é costume neste repo).
- Onde armazenar o `Map<activityKey, {start, end}>` de janelas projetadas
  (uma entrada por dev, já que só a próxima é projetada) antes de passar pra
  `ActivityRow` — provavelmente um `useMemo` no componente `TimelineView`,
  próximo de onde `byDeveloperAcrossAllSprints`/`availabilityDate` já são
  calculados (linha ~583-589).
- Novo prop em `ActivityRow` (ex. `projectedImplWindow: {start: string; end:
  string} | null`) e o trecho de renderização da barra tracejada em si —
  espelhando como `implBoxLeft`/`implBoxRight` já desenham a caixa tracejada
  da janela estimada hoje (`TimelineView.tsx:764-766`), mas sem preenchimento
  e com o texto "PROJEÇÃO" centralizado.
- Se vale a pena também estender `computeDomain` (`TimelineView.tsx:2342`)
  para incluir o fim da janela projetada nas datas consideradas — sem isso, a
  barra projetada de uma tarefa com prazo longe pode ficar cortada fora do
  eixo de dias visível. Recomendo incluir, mas é detalhe de implementação.
- Testes unitários da nova lógica de ordenação/pulo de fila e da fórmula de
  projeção (casos: fila simples, fila pulada, dev sem nenhuma atividade em
  andamento, atividade sem `storyPoints`), seguindo o padrão de
  `describe`/`test` já usado em `TimelineView.test.ts` para
  `projectDeveloperAvailabilityDate`/`isDeveloperAvailable`.

## Pontos de integração no código existente (referência para o builder)

- `client/src/components/TimelineView.tsx:2381-2406` —
  `isDeveloperAvailable`, `projectDeveloperAvailabilityDate`,
  `shouldShowAvailabilityDate`: base da lógica de disponibilidade atual, a
  estender.
- `client/src/components/TimelineView.tsx:2360-2378` — `groupByDeveloper`:
  ordenação atual da fila por dev, base pra entender/reaproveitar a ordem
  "do board".
- `client/src/components/TimelineView.tsx:583-621` — loop de renderização por
  dev, onde `availabilityDate` já é calculado e exibido; local natural pra
  calcular também a janela projetada da próxima tarefa e repassar pra
  `ActivityRow`.
- `client/src/components/TimelineView.tsx:734-900` (aprox.) — `ActivityRow`,
  onde `implBoxLeft`/`implBoxRight`/`implFillCells` já desenham a barra real
  de Impl.; novo trecho análogo para a barra projetada.
- `client/src/compute/timeline.ts` — `computeTimeline`, `IMPL_SHARE`: fórmula
  de projeção a reaproveitar sem alterar.
- `client/src/components/BoardScreen.tsx:62-64, 230-243` —
  `hoursPerPfBySprintId` já calculado aqui; só falta passar como prop pra
  `TimelineView`.
- `server/src/domain/mapActivity.ts:176, 190` — `notStarted`/`startDate` de
  atividades não iniciadas (data de criação da story), usado como base da
  ordem da fila no client.
