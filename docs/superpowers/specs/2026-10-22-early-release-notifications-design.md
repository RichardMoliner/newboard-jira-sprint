# Notificações de liberação antecipada — Admin panel + Google Chat

## Intenção e por quê

Tarefas marcadas com a tag `liberacao_antecipada` têm um compromisso de entrega antes do prazo normal da sprint. Hoje não existe nenhum lembrete automático — o risco de perder o prazo de uma liberação antecipada só é percebido quando alguém olha manualmente o painel. O objetivo desta feature é avisar proativamente o time de dev, no Google Chat, conforme o prazo se aproxima (5, 3, 1 e 0 dias restantes), separando o aviso por canal (aplicação/extensão) conforme a sprint da tarefa.

Essa automação só deve existir no painel do Richard (dono do admin), que é quem vai cadastrar os webhooks do Google Chat. Analistas de produto usam o mesmo painel mas não devem ter acesso a essa configuração.

## Goals

- Disparar mensagem no Google Chat quando uma tarefa com `earlyDelivery = true` estiver a 5, 3, 1 ou 0 dias da data de `legalDeadline`, uma única vez por marco (não repetir o mesmo aviso).
- Rotear a mensagem para o canal certo (aplicação ou extensão) conforme o grupo da sprint da tarefa (`config.sprintSettings[sprintId].group`).
- Checagem automática diária, às 08h, sem exigir o painel aberto no navegador (processo de servidor, não front-end).
- Parar de avisar quando a tarefa chega em "Aguardando liberação" ou "Atendida" (`isDone`) — nesse ponto a corrida contra o prazo já não importa mais.
- Novo menu "Admin" ao lado de "Configurações", travado por senha validada no servidor, onde os dois webhooks (aplicação/extensão) são cadastrados.

## Non-goals

- Não vamos criar um novo campo de data para a liberação antecipada — `legalDeadline` (customfield_21800, já exibido como "Entrega antecipada - DD/MM" na UI) é a fonte de verdade da data-alvo.
- Não vamos expor o admin/webhooks para analistas de produto nem criar múltiplos níveis de permissão — é uma senha única, booleana (acesso ou não).
- Não vamos construir uma tela de histórico de notificações enviadas nesta primeira versão — só log no servidor.
- Não vamos adicionar retry/fila robusta para falha de envio ao Google Chat — se o webhook falhar, registra no log do servidor e segue (sem reenvio automático).
- Não vamos migrar para um scheduler/framework de jobs (ex. node-cron) além do mínimo necessário — um `setInterval`/verificação de horário simples no processo já existente do servidor é suficiente, dado que não há infraestrutura de cron hoje.

## Anti-goals (seria falha mesmo funcionando)

- Enviar a mesma notificação mais de uma vez para o mesmo marco (5/3/1/0 dias) de uma mesma tarefa.
- Vazar a senha do admin ou os webhooks configurados para o bundle do client (JS) ou para qualquer resposta de API não autenticada.
- Continuar avisando uma tarefa depois que ela já está em "Aguardando liberação" ou concluída.

## Constraints

- Senha do admin validada **no servidor**, não só no client — mesmo que o front esconda o menu, qualquer rota de leitura/escrita dos webhooks exige a senha em cada chamada (não fica "logado" permanentemente sem reforço no servidor).
- Webhooks armazenados em arquivo local no servidor (seguindo o padrão já existente de `config.json` via `configStore.ts`), não em variável de ambiente nem banco novo.
- Checagem diária às 08h (horário do servidor).
- Mensagem contém: título da tarefa, link, dev responsável, dias restantes.
- Sprint sem grupo configurado (`group: null`) → não envia, só loga (consistente com o Non-goal de não resolver ambiguidade silenciosamente enviando para lugar errado).

## Decisões já tomadas (na conversa)

- **Gatilho de elegibilidade**: `activity.earlyDelivery === true` AND `activity.legalDeadline !== null` AND `!activity.isDone` AND status atual não é "Aguardando liberação" (via `testDone === true && !isDone`, que é o estado que antecede "Atendida" nessa fase — ver nota ao builder abaixo).
- **Marcos de aviso**: dias restantes até `legalDeadline` iguais a 5, 3, 1 ou 0. Um marco é considerado "atingido" quando dias restantes `<= marco` e esse marco ainda não foi avisado para a tarefa — isto é, se a checagem não rodar no dia exato (servidor desligado, por exemplo), o aviso é enviado com atraso assim que a checagem voltar a rodar, nunca é perdido silenciosamente. Dias restantes negativos (prazo já vencido e nunca avisado) contam como o marco "0". Marcos menores que o dias-restantes atual mas ainda não avisados também disparam na mesma checagem (ex.: se pulou direto de "7 dias restantes" para "2 dias restantes", avisa 5 e 3 juntos, já que nenhum dos dois foi avisado ainda) — um marco já avisado para a tarefa (nesse `legalDeadline`) não é reenviado.
- **Mudança de prazo**: o controle de "já avisado" é por `(issueKey, legalDeadline, marco)`, não só `(issueKey, marco)`. Se `legalDeadline` mudar no Jira depois de um aviso já enviado, os marcos voltam a valer para a nova data (o registro antigo, associado ao `legalDeadline` anterior, simplesmente não bate mais com o valor atual e os marcos da nova data podem disparar normalmente).
- **Frequência**: uma varredura diária, às 08h, no processo do servidor.
- **Canal**: por grupo da sprint (`aplicacao` | `extensao`), vindo de `config.sprintSettings[activity.sprintId].group`. Sprint sem grupo configurado → não envia, loga a razão.
- **Conteúdo da mensagem**: título da tarefa (`activity.title`), link (`activity.url`), dev responsável (`activity.developer`), dias restantes até a liberação.
- **Falha de envio ao webhook**: não reenvia automaticamente — só registra no log do servidor.
- **Local de acesso**: novo menu "Admin" ao lado de "Configurações" no header (mesmo padrão de `showSettings`/`SettingsScreen` em `BoardScreen.tsx`), visível a todos mas com conteúdo bloqueado por senha.
- **Senha**: `TEST_ADMIN_PASSWORD_PLACEHOLDER`, validada no servidor (não embutida no bundle do client). Cabe ao builder decidir a forma de armazenamento no servidor (ex.: variável de ambiente `ADMIN_PASSWORD` no `.env`, que já é gitignored e é o padrão do projeto para segredos — ver `requireEnv('JIRA_BASE_URL')`), nunca em `config.json` versionável nem hardcoded no código.
- **Persistência dos webhooks**: arquivo local no servidor, seguindo o padrão de `configStore.ts` (merge-on-existing, escrita atômica via tmp+rename, nunca ecoa segredos de volta como texto puro — mesmo padrão do `jiraPasswordSet` booleano em `routes/config.ts`).

## O que fica a cargo do builder

- Exato formato de persistência do estado "quais marcos já foram avisados por tarefa e por prazo" (para não duplicar avisos, mas também não perder avisos quando o prazo muda) — precisa sobreviver a reinícios do servidor. Ex.: um arquivo JSON simples `notified.json` com `{ [issueKey]: { legalDeadline: string; milestones: number[] } }`, onde um `legalDeadline` diferente do registrado reseta `milestones` antes de aplicar a lógica de marcos atingidos.
- Mecanismo exato do agendamento diário às 08h dentro do processo Node já existente (ex.: calcular o próximo 08h e usar `setTimeout` recursivo, ou um `setInterval` de checagem a cada alguns minutos comparando a hora atual) — qualquer abordagem simples e testável serve; não introduzir uma dependência nova de scheduler a menos que seja claramente mais simples.
- Como obter a lista de tarefas elegíveis: a checagem diária roda fora de uma requisição HTTP, então precisa chamar a mesma lógica de `fetchBoardData` (ou uma función equivalente) usando o `config` persistido (vertical, credenciais Jira, sprint settings), replicando a construção de argumentos hoje feita em `routes/boardData.ts:13-37`.
- Decidir exatamente qual sinal usar para "ainda não está em Aguardando liberação/Atendida" dentre os campos já existentes em `Activity` (`isDone`, `testDone`) — confirmar isso olhando `domain/types.ts` e o mapeamento em `mapActivity.ts` antes de implementar, já que o nome exato do status "Aguardando liberação" é um `statusHistory` label, não necessariamente um campo booleano direto.
- Esquema exato da nova rota/rotas de Admin (ex. `POST /api/admin/verify`, `GET/POST /api/admin/webhooks`) e de onde a senha trafega (header, body) — seguindo convenções REST já usadas em `routes/config.ts`.
- Layout da tela de Admin no client (`AdminScreen.tsx` ou nome equivalente), espelhando a estrutura de `SettingsScreen` — formulário de senha, depois formulário dos dois webhooks.
- Formato exato do payload enviado ao webhook do Google Chat (a API do Google Chat Incoming Webhook espera um JSON `{ text: string }` ou `cards`; usar o formato simples de texto é suficiente dado que o conteúdo definido é só texto).
- Testes unitários da lógica pura de elegibilidade/marco (quais tarefas, quais dias, formatação da mensagem) seguindo o padrão de testes existente (Vitest, funções puras testadas isoladamente como em `computeIndicators.test.ts`/`statusHistory.test.ts`); o envio HTTP ao webhook em si pode ser testado com mock de `fetch`.

## Pontos de integração no código existente (referência para o builder)

- `server/src/index.ts` — local para inicializar o scheduler diário, após montar os routers e antes de `app.listen`.
- `server/src/config/configStore.ts` — `AppConfig` precisará de um novo campo, ex. `webhooks: { aplicacao: string | null; extensao: string | null }`, seguindo o padrão de leitura/escrita já existente.
- `server/src/routes/config.ts` — padrão de referência para a nova rota de Admin (merge parcial, nunca ecoar segredo).
- `server/src/jira/fetchBoardData.ts` (`fetchBoardData(vertical, credentials, hoursPerPfBySprintId, hoursPerDayBySprintId, fallbackHoursPerDay)`) e `server/src/routes/boardData.ts:13-37` — como montar os argumentos a partir do `config` persistido, para reuso fora do contexto HTTP.
- `client/src/components/BoardScreen.tsx` (linha ~139, botão "Configurações", estado `showSettings`) — padrão para o novo botão/estado "Admin".
- `client/src/sprintGrouping.ts` — lógica de grupo por sprint no client; o job do servidor replica o equivalente lendo diretamente `config.sprintSettings[activity.sprintId]?.group`.
- `.env` (gitignored, carregado via `dotenv.config()` em `index.ts:16`) — local sugerido para a senha do admin, seguindo o padrão de `JIRA_BASE_URL`.
