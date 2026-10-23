# Notificações de liberação antecipada — Admin panel + Google Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Avisar automaticamente, via Google Chat, quando uma tarefa com liberação antecipada está a 5, 3, 1 ou 0 dias do prazo — com um novo menu Admin (travado por senha validada no servidor) para cadastrar os webhooks.

**Architecture:** Um job diário no próprio processo do servidor Express reusa `fetchBoardData` (a mesma função usada pela rota `/api/board-data`) para obter as atividades elegíveis, calcula quais marcos (5/3/1/0 dias) ainda não foram avisados para cada uma (lendo um arquivo `notified.json` local), envia a mensagem ao webhook do Google Chat do grupo da sprint, e só então marca o marco como avisado. Um novo conjunto de rotas `/api/admin/*`, protegidas por uma senha fixa validada em cada requisição, permite cadastrar os dois webhooks (aplicação/extensão) a partir de uma nova tela no client.

**Tech Stack:** Express + TypeScript (server), React + TypeScript (client), Vitest (testes server e client), `fetch` nativo do Node para o webhook do Google Chat.

**Spec:** `docs/superpowers/specs/2026-10-22-early-release-notifications-design.md`

## Global Constraints

- Senha do admin (`TEST_ADMIN_PASSWORD_PLACEHOLDER`) validada **no servidor** em toda chamada às rotas de admin — nunca só no client.
- Senha do admin vive em `.env` como `ADMIN_PASSWORD` (já gitignored), nunca em `config.json` nem hardcoded.
- Webhooks persistidos em arquivo local no servidor, seguindo o padrão de `configStore.ts` (merge-on-existing, escrita atômica tmp+rename, nunca ecoar o valor salvo de volta como texto puro — só um booleano "está configurado").
- Checagem diária às 08h (horário do servidor), sem dependência nova de scheduler.
- Mensagem contém: título, link, dev responsável, dias restantes.
- Sprint sem `group` configurado (`null`) → não envia, só loga.
- Elegibilidade: `activity.earlyDelivery === true && activity.legalDeadline !== null && !activity.testDone && !activity.isDone` (a condição `!testDone && !isDone` é equivalente a "não está em Aguardando liberação nem Atendida", conforme a ordem de fases em `statusHistory.ts`: "Aguardando liberação" só existe quando `testDone` é true e `isDone` ainda é false).
- Marco "atingido" = dias restantes `<= marco`, exceto quando dias restantes é negativo (prazo já vencido) — nesse caso só o marco `0` é considerado atingido, nunca 5/3/1 retroativos.
- Um marco só é marcado como "avisado" depois que o envio ao webhook retorna sucesso — falha de envio não persiste o marco, para que a checagem do dia seguinte tente de novo.
- Mudança de `legalDeadline` depois de um marco já avisado invalida o registro anterior (os marcos voltam a valer para a nova data).

## Review Focus

- Sprint da tarefa sem `group` configurado: não deve enviar nada, só logar — não pode cair silenciosamente num canal errado nem quebrar a checagem das outras tarefas.
- Falha ao enviar pro webhook (rede fora, URL inválida): não pode marcar o marco como avisado — a tarefa tem que voltar a ser candidata na próxima checagem.
- `legalDeadline` no passado (prazo vencido) e nunca avisado antes: dispara só o marco `0`, não os quatro de uma vez.
- `legalDeadline` mudou depois de marcos já avisados para o valor antigo: os marcos voltam a valer para a nova data, não ficam bloqueados para sempre.
- Senha de admin incorreta ou ausente no header: toda rota `/api/admin/*` retorna 401 sem vazar se os webhooks já estão configurados.

---

### Task 1: Cálculo de elegibilidade e marcos pendentes

**Files:**
- Create: `server/src/notifications/eligibility.ts`
- Test: `server/src/notifications/eligibility.test.ts`

**Interfaces:**
- Consumes: `Activity` de `server/src/domain/types.ts` (campos `key`, `earlyDelivery`, `legalDeadline`, `testDone`, `isDone`, `sprintId`, `title`, `url`, `developer`).
- Produces:
  ```ts
  export interface NotifiedEntry {
    legalDeadline: string;
    milestones: number[];
  }
  export type NotifiedState = Record<string, NotifiedEntry>; // chave: Activity.key

  export interface DueNotification {
    activity: Activity;
    milestone: number; // 5 | 3 | 1 | 0
    daysRemaining: number;
  }

  export const MILESTONES: number[] = [5, 3, 1, 0];

  export function isEligibleForEarlyDeliveryNotification(activity: Activity): boolean;
  export function daysBetween(fromDateOnly: string, toDateOnly: string): number; // toDate - fromDate, em dias corridos
  export function getNotifiedMilestones(state: NotifiedState, issueKey: string, legalDeadline: string): number[];
  export function computeDueNotifications(activities: Activity[], today: string, state: NotifiedState): DueNotification[];
  ```
  Usado por Task 2 (persistência) e Task 7 (scheduler).

- [ ] **Step 1: Escrever os testes de `isEligibleForEarlyDeliveryNotification`**

```ts
function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    key: 'PROJ-1', url: 'https://jira/PROJ-1', title: 'Tarefa', sprintId: 's1', sprintName: 'Sprint 1',
    isCarried: false, developer: 'Fulano', tester: null, storyPoints: null, startDate: '2026-10-01',
    dueDate: null, deliveredDate: null, deliveredOnTime: null, assertividadePercent: null,
    assertividadeComBugsPercent: null, status: 'Em andamento', isDone: false, isOverdue: false,
    notStarted: false, implDone: false, implDoneDate: null, testDone: false, implWindow: null,
    testWindow: null, statusHistory: [], implEstimatedHours: null, testEstimatedHours: null,
    implLoggedHours: null, testLoggedHours: null, bugsLoggedHours: null, implBugsLoggedHours: null,
    testBugsLoggedHours: null, worklogEntries: [], bugs: [], addedAfterSprintStart: false,
    sprintEnteredAt: null, notImpactsDeploy: false, earlyDelivery: true, featureFlag: false,
    legalRequirement: null, legalDeadline: '2026-10-27',
    ...overrides,
  };
}

test('elegível quando earlyDelivery, legalDeadline definido, não testDone, não isDone', () => {
  expect(isEligibleForEarlyDeliveryNotification(activity())).toBe(true);
});

test('não elegível sem earlyDelivery', () => {
  expect(isEligibleForEarlyDeliveryNotification(activity({ earlyDelivery: false }))).toBe(false);
});

test('não elegível sem legalDeadline', () => {
  expect(isEligibleForEarlyDeliveryNotification(activity({ legalDeadline: null }))).toBe(false);
});

test('não elegível quando testDone (Aguardando liberação)', () => {
  expect(isEligibleForEarlyDeliveryNotification(activity({ testDone: true }))).toBe(false);
});

test('não elegível quando isDone (Atendida)', () => {
  expect(isEligibleForEarlyDeliveryNotification(activity({ isDone: true, testDone: true }))).toBe(false);
});
```

- [ ] **Step 2: Rodar os testes e confirmar falha** (`isEligibleForEarlyDeliveryNotification` ainda não existe)

Run: `cd server && npx vitest run src/notifications/eligibility.test.ts`
Expected: FAIL (module not found / function not defined)

- [ ] **Step 3: Implementar `isEligibleForEarlyDeliveryNotification` e `daysBetween`**

`daysBetween(from, to)` recebe datas `YYYY-MM-DD`, retorna `(Date(to) - Date(from)) / dia em ms`, arredondado (pode ser negativo).

- [ ] **Step 4: Rodar os testes e confirmar sucesso**

Run: `cd server && npx vitest run src/notifications/eligibility.test.ts`
Expected: PASS

- [ ] **Step 5: Escrever os testes de `computeDueNotifications`**

```ts
test('tarefa nunca avisada, 5 dias restantes exatos, dispara só o marco 5', () => {
  const act = activity({ legalDeadline: '2026-10-27' });
  const result = computeDueNotifications([act], '2026-10-22', {});
  expect(result).toEqual([{ activity: act, milestone: 5, daysRemaining: 5 }]);
});

test('checagem pulou dias: 7 restantes na última vez, hoje 2 restantes, dispara 5 e 3 juntos (nenhum avisado ainda)', () => {
  const act = activity({ legalDeadline: '2026-10-24' }); // hoje + 2
  const result = computeDueNotifications([act], '2026-10-22', {});
  expect(result.map((r) => r.milestone)).toEqual([5, 3]);
});

test('marco já avisado para o legalDeadline atual não repete', () => {
  const act = activity({ legalDeadline: '2026-10-27' });
  const state = { [act.key]: { legalDeadline: '2026-10-27', milestones: [5] } };
  const result = computeDueNotifications([act], '2026-10-22', state);
  expect(result).toEqual([]);
});

test('prazo já vencido e nunca avisado dispara só o marco 0, não 5/3/1', () => {
  const act = activity({ legalDeadline: '2026-10-19' }); // hoje - 3
  const result = computeDueNotifications([act], '2026-10-22', {});
  expect(result.map((r) => r.milestone)).toEqual([0]);
});

test('legalDeadline mudou depois de marcos avisados para a data antiga: marcos voltam a valer', () => {
  const act = activity({ legalDeadline: '2026-11-15' });
  const state = { [act.key]: { legalDeadline: '2026-10-30', milestones: [5, 3] } };
  const result = computeDueNotifications([act], '2026-10-22', state);
  expect(result).toEqual([]); // faltam 24 dias pra nova data — nenhum marco atingido ainda, mas não bloqueado
});

test('tarefa não elegível não aparece mesmo com legalDeadline próximo', () => {
  const act = activity({ legalDeadline: '2026-10-22', isDone: true, testDone: true });
  expect(computeDueNotifications([act], '2026-10-22', {})).toEqual([]);
});
```

- [ ] **Step 6: Rodar os testes e confirmar falha**

Run: `cd server && npx vitest run src/notifications/eligibility.test.ts`
Expected: FAIL

- [ ] **Step 7: Implementar `getNotifiedMilestones` e `computeDueNotifications`**

`getNotifiedMilestones(state, issueKey, legalDeadline)`: retorna `state[issueKey]?.milestones` só se `state[issueKey]?.legalDeadline === legalDeadline`, senão `[]`.

`computeDueNotifications`: para cada atividade elegível, calcula `daysRemaining = daysBetween(today, activity.legalDeadline)`; `reached = daysRemaining < 0 ? [0] : MILESTONES.filter((m) => daysRemaining <= m)`; `pending = reached.filter((m) => !getNotifiedMilestones(state, activity.key, activity.legalDeadline!).includes(m))`; ordena `pending` do maior pro menor (5→3→1→0); gera um `DueNotification` por marco pendente.

- [ ] **Step 8: Rodar os testes e confirmar sucesso**

Run: `cd server && npx vitest run src/notifications/eligibility.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
cd server && git add src/notifications/eligibility.ts src/notifications/eligibility.test.ts
git commit -m "feat: calcula marcos de notificação de liberação antecipada pendentes"
```

---

### Task 2: Persistência do estado "já avisado" (`notified.json`)

**Files:**
- Create: `server/src/notifications/notifiedStore.ts`
- Test: `server/src/notifications/notifiedStore.test.ts`
- Modify: `.gitignore` (adicionar `notified.json`)

**Interfaces:**
- Consumes: `NotifiedState`, `NotifiedEntry` de `server/src/notifications/eligibility.ts` (Task 1).
- Produces:
  ```ts
  export async function readNotifiedState(path: string): Promise<NotifiedState>;
  export async function writeNotifiedState(path: string, state: NotifiedState): Promise<void>;
  export function recordNotified(state: NotifiedState, issueKey: string, legalDeadline: string, milestone: number): NotifiedState;
  ```
  Usado por Task 7 (scheduler).

- [ ] **Step 1: Escrever os testes de `recordNotified`**

```ts
test('adiciona o marco à lista existente quando legalDeadline bate', () => {
  const state = { 'PROJ-1': { legalDeadline: '2026-10-27', milestones: [5] } };
  const next = recordNotified(state, 'PROJ-1', '2026-10-27', 3);
  expect(next['PROJ-1']).toEqual({ legalDeadline: '2026-10-27', milestones: [5, 3] });
});

test('cria entrada nova para uma chave inexistente', () => {
  const next = recordNotified({}, 'PROJ-2', '2026-11-01', 5);
  expect(next['PROJ-2']).toEqual({ legalDeadline: '2026-11-01', milestones: [5] });
});

test('reseta os marcos quando o legalDeadline registrado é diferente do atual', () => {
  const state = { 'PROJ-1': { legalDeadline: '2026-10-27', milestones: [5, 3] } };
  const next = recordNotified(state, 'PROJ-1', '2026-11-15', 5);
  expect(next['PROJ-1']).toEqual({ legalDeadline: '2026-11-15', milestones: [5] });
});

test('não muta o state recebido', () => {
  const state = { 'PROJ-1': { legalDeadline: '2026-10-27', milestones: [5] } };
  recordNotified(state, 'PROJ-1', '2026-10-27', 3);
  expect(state['PROJ-1'].milestones).toEqual([5]);
});
```

- [ ] **Step 2: Rodar os testes e confirmar falha**

Run: `cd server && npx vitest run src/notifications/notifiedStore.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar `recordNotified`**

Retorna um novo objeto (não muta `state`); segue o mesmo princípio imutável usado pelos outros computes do projeto (ex. `computeStatusHistory`).

- [ ] **Step 4: Rodar os testes e confirmar sucesso**

Run: `cd server && npx vitest run src/notifications/notifiedStore.test.ts`
Expected: PASS

- [ ] **Step 5: Implementar `readNotifiedState`/`writeNotifiedState`**

Mesmo padrão de `server/src/config/configStore.ts`: `readNotifiedState` lê o JSON e retorna `{}` se o arquivo não existir ou estiver corrompido (`ENOENT` ou `SyntaxError`); `writeNotifiedState` escreve em arquivo temporário (`${path}.${process.pid}.${Date.now()}.tmp`) e troca com `rename` (atômico). Sem teste dedicado de I/O real — cobertos indiretamente pela Task 7; se preferir, adicione um teste de round-trip usando um arquivo temporário em `os.tmpdir()`.

- [ ] **Step 6: Adicionar `notified.json` ao `.gitignore`**

Mesma linha de `config.json` em `.gitignore` — arquivo de estado local, não deve ser versionado.

- [ ] **Step 7: Rodar toda a suíte do server**

Run: `cd server && npm test`
Expected: PASS (nenhuma regressão)

- [ ] **Step 8: Commit**

```bash
cd server && git add src/notifications/notifiedStore.ts src/notifications/notifiedStore.test.ts ../.gitignore
git commit -m "feat: persiste quais marcos de liberação antecipada já foram avisados"
```

---

### Task 3: Mensagem e envio ao Google Chat

**Files:**
- Create: `server/src/notifications/googleChat.ts`
- Test: `server/src/notifications/googleChat.test.ts`

**Interfaces:**
- Consumes: `DueNotification` de `server/src/notifications/eligibility.ts` (Task 1).
- Produces:
  ```ts
  export function formatEarlyDeliveryMessage(notification: DueNotification): string;
  export async function sendGoogleChatMessage(webhookUrl: string, text: string): Promise<{ ok: boolean; error?: string }>;
  ```
  Usado por Task 7 (scheduler).

- [ ] **Step 1: Escrever os testes de `formatEarlyDeliveryMessage`**

```ts
test('formata com dias restantes positivos', () => {
  const notification = {
    activity: activity({ key: 'PROJ-1', title: 'Corrigir X', url: 'https://jira/PROJ-1', developer: 'Fulano' }),
    milestone: 5,
    daysRemaining: 5,
  };
  expect(formatEarlyDeliveryMessage(notification)).toBe(
    'Liberação antecipada — faltam 5 dias\nCorrigir X\nhttps://jira/PROJ-1\nDev: Fulano',
  );
});

test('marco 0 com dias restantes 0 (dia da liberação)', () => {
  const notification = { activity: activity({ title: 'Y', url: 'https://jira/PROJ-2', developer: 'Ciclana' }), milestone: 0, daysRemaining: 0 };
  expect(formatEarlyDeliveryMessage(notification)).toBe(
    'Liberação antecipada — é hoje\nY\nhttps://jira/PROJ-2\nDev: Ciclana',
  );
});

test('marco 0 com dias restantes negativos (prazo já vencido)', () => {
  const notification = { activity: activity({ title: 'Z', url: 'https://jira/PROJ-3', developer: 'Beltrano' }), milestone: 0, daysRemaining: -2 };
  expect(formatEarlyDeliveryMessage(notification)).toBe(
    'Liberação antecipada — prazo já passou\nZ\nhttps://jira/PROJ-3\nDev: Beltrano',
  );
});
```

(reaproveite o helper `activity()` da Task 1 — copie-o para este arquivo de teste também, já que cada arquivo de teste é independente.)

- [ ] **Step 2: Rodar os testes e confirmar falha**

Run: `cd server && npx vitest run src/notifications/googleChat.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar `formatEarlyDeliveryMessage`**

Primeira linha: `'Liberação antecipada — faltam N dias'` para `milestone > 0` com `daysRemaining >= 0` usando `daysRemaining` (não `milestone`) no texto; `'Liberação antecipada — é hoje'` quando `daysRemaining === 0`; `'Liberação antecipada — prazo já passou'` quando `daysRemaining < 0`. Linhas seguintes: título, URL, `'Dev: ' + developer`, uma por linha (`\n`).

- [ ] **Step 4: Rodar os testes e confirmar sucesso**

Run: `cd server && npx vitest run src/notifications/googleChat.test.ts`
Expected: PASS

- [ ] **Step 5: Escrever os testes de `sendGoogleChatMessage`**

```ts
import { vi } from 'vitest';

test('faz POST com o payload { text } e retorna ok quando a resposta é 2xx', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetchMock);
  const result = await sendGoogleChatMessage('https://chat.googleapis.com/hook', 'oi');
  expect(fetchMock).toHaveBeenCalledWith('https://chat.googleapis.com/hook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'oi' }),
  });
  expect(result).toEqual({ ok: true });
  vi.unstubAllGlobals();
});

test('retorna ok:false com erro quando a resposta não é 2xx', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' }));
  const result = await sendGoogleChatMessage('https://chat.googleapis.com/hook', 'oi');
  expect(result.ok).toBe(false);
  expect(result.error).toContain('404');
  vi.unstubAllGlobals();
});

test('retorna ok:false com erro quando fetch rejeita (sem lançar)', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
  const result = await sendGoogleChatMessage('https://chat.googleapis.com/hook', 'oi');
  expect(result).toEqual({ ok: false, error: 'network down' });
  vi.unstubAllGlobals();
});
```

- [ ] **Step 6: Rodar os testes e confirmar falha**

Run: `cd server && npx vitest run src/notifications/googleChat.test.ts`
Expected: FAIL

- [ ] **Step 7: Implementar `sendGoogleChatMessage`**

`fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })` dentro de um `try/catch`; nunca lança — todo caminho de erro (rede ou status não-2xx) retorna `{ ok: false, error }`.

- [ ] **Step 8: Rodar os testes e confirmar sucesso**

Run: `cd server && npx vitest run src/notifications/googleChat.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
cd server && git add src/notifications/googleChat.ts src/notifications/googleChat.test.ts
git commit -m "feat: formata e envia mensagem de liberação antecipada ao Google Chat"
```

---

### Task 4: Webhooks no `AppConfig` + senha do admin no `.env`

**Files:**
- Modify: `server/src/config/configStore.ts`
- Modify: `server/src/config/configStore.test.ts` (criar se não existir)

**Interfaces:**
- Produces: `AppConfig.webhooks: { aplicacao: string | null; extensao: string | null }`. Usado por Task 5 (rotas admin) e Task 7 (scheduler).

- [ ] **Step 1: Escrever/estender os testes de `readConfig`/`writeConfig` para o novo campo**

Se `server/src/config/configStore.test.ts` não existir, crie-o cobrindo o comportamento já existente de `readConfig` (arquivo ausente retorna config vazia) e some este caso:

```ts
test('readConfig traz webhooks nulos quando ausentes no arquivo', async () => {
  const config = await readConfig(pathToNonexistentFile);
  expect(config.webhooks).toEqual({ aplicacao: null, extensao: null });
});

test('writeConfig e readConfig fazem round-trip dos webhooks', async () => {
  const path = join(tmpdir(), `config-test-${Date.now()}.json`);
  await writeConfig(path, { ...emptyConfigForTest, webhooks: { aplicacao: 'https://a', extensao: null } });
  const read = await readConfig(path);
  expect(read.webhooks).toEqual({ aplicacao: 'https://a', extensao: null });
});
```

(`emptyConfigForTest` é um `AppConfig` completo com os demais campos `null`/`{}`, igual ao que `emptyConfig()` produz — monte-o inline no teste.)

- [ ] **Step 2: Rodar os testes e confirmar falha**

Run: `cd server && npx vitest run src/config/configStore.test.ts`
Expected: FAIL (campo `webhooks` ainda não existe no tipo/leitura)

- [ ] **Step 3: Adicionar `webhooks` a `AppConfig`, `emptyConfig()` e `readConfig()`**

`AppConfig.webhooks: { aplicacao: string | null; extensao: string | null }`; `emptyConfig()` retorna `webhooks: { aplicacao: null, extensao: null }`; `readConfig` lê `parsed.webhooks?.aplicacao ?? null` e `parsed.webhooks?.extensao ?? null` (mesmo padrão defensivo dos demais campos).

- [ ] **Step 4: Rodar os testes e confirmar sucesso**

Run: `cd server && npx vitest run src/config/configStore.test.ts`
Expected: PASS

- [ ] **Step 5: Rodar toda a suíte do server pra garantir que nada que lê `AppConfig` quebrou**

Run: `cd server && npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd server && git add src/config/configStore.ts src/config/configStore.test.ts
git commit -m "feat: adiciona webhooks de liberação antecipada ao AppConfig"
```

---

### Task 5: Rotas de admin (`/api/admin/*`) protegidas por senha

**Files:**
- Create: `server/src/routes/admin.ts`
- Test: `server/src/routes/admin.test.ts`
- Modify: `server/src/index.ts` (montar `adminRouter`)

**Interfaces:**
- Consumes: `readConfig`/`writeConfig`/`AppConfig` de `server/src/config/configStore.ts` (Task 4); `process.env.ADMIN_PASSWORD`.
- Produces: `export function adminRouter(configPath: string): Router` com:
  - `POST /admin/verify` — body `{ password: string }` → `200 { ok: true }` se bater com `process.env.ADMIN_PASSWORD`, senão `401 { error: 'Senha incorreta.' }`.
  - `GET /admin/webhooks` — header `x-admin-password` → `200 { aplicacaoSet: boolean, extensaoSet: boolean }` ou `401`.
  - `POST /admin/webhooks` — header `x-admin-password`, body `{ aplicacao?: string; extensao?: string }` (string vazia limpa o valor, campo ausente mantém o atual — mesmo padrão de `parseOptionalDateField` em `routes/config.ts`) → `200 { aplicacaoSet, extensaoSet }` ou `401`.

- [ ] **Step 1: Escrever os testes de autenticação e das rotas (com Express `app` de teste)**

```ts
import express from 'express';
import request from 'supertest'; // adicionar supertest como devDependency se ainda não existir
import { adminRouter } from './admin.js';

function buildApp(configPath: string) {
  const app = express();
  app.use(express.json());
  app.use('/api', adminRouter(configPath));
  return app;
}

beforeEach(() => {
  process.env.ADMIN_PASSWORD = 'TEST_ADMIN_PASSWORD_PLACEHOLDER';
});

test('POST /admin/verify com senha correta retorna ok', async () => {
  const res = await request(buildApp(tmpConfigPath)).post('/api/admin/verify').send({ password: 'TEST_ADMIN_PASSWORD_PLACEHOLDER' });
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ ok: true });
});

test('POST /admin/verify com senha incorreta retorna 401', async () => {
  const res = await request(buildApp(tmpConfigPath)).post('/api/admin/verify').send({ password: 'errada' });
  expect(res.status).toBe(401);
});

test('GET /admin/webhooks sem header de senha retorna 401', async () => {
  const res = await request(buildApp(tmpConfigPath)).get('/api/admin/webhooks');
  expect(res.status).toBe(401);
});

test('POST /admin/webhooks com senha salva os webhooks e GET reflete como "set"', async () => {
  const app = buildApp(tmpConfigPath);
  const post = await request(app)
    .post('/api/admin/webhooks')
    .set('x-admin-password', 'TEST_ADMIN_PASSWORD_PLACEHOLDER')
    .send({ aplicacao: 'https://chat.googleapis.com/a', extensao: 'https://chat.googleapis.com/b' });
  expect(post.status).toBe(200);
  expect(post.body).toEqual({ aplicacaoSet: true, extensaoSet: true });

  const get = await request(app).get('/api/admin/webhooks').set('x-admin-password', 'TEST_ADMIN_PASSWORD_PLACEHOLDER');
  expect(get.body).toEqual({ aplicacaoSet: true, extensaoSet: true });
});

test('POST /admin/webhooks com campo ausente mantém o valor já salvo', async () => {
  const app = buildApp(tmpConfigPath2);
  await request(app).post('/api/admin/webhooks').set('x-admin-password', 'TEST_ADMIN_PASSWORD_PLACEHOLDER').send({ aplicacao: 'https://x' });
  const res = await request(app).post('/api/admin/webhooks').set('x-admin-password', 'TEST_ADMIN_PASSWORD_PLACEHOLDER').send({ extensao: 'https://y' });
  expect(res.body).toEqual({ aplicacaoSet: true, extensaoSet: true });
});
```

Use um arquivo de config temporário por teste (`join(tmpdir(), \`config-admin-test-${Date.now()}-${Math.random()}.json\`)`) para isolar leitura/escrita entre testes.

- [ ] **Step 2: Instalar `supertest` como devDependency do server (se ainda não estiver instalado)**

Run: `cd server && npm install --save-dev supertest @types/supertest`

- [ ] **Step 3: Rodar os testes e confirmar falha**

Run: `cd server && npx vitest run src/routes/admin.test.ts`
Expected: FAIL (`adminRouter` não existe)

- [ ] **Step 4: Implementar `adminRouter`**

Um middleware local `requireAdminPassword` lê a senha de `req.body?.password` (só na rota `/verify`) ou do header `x-admin-password` (nas demais), compara com `process.env.ADMIN_PASSWORD` (`undefined` nunca autentica, mesmo com header vazio) e responde `401 { error: 'Senha incorreta.' }` se não bater. `GET/POST /admin/webhooks` seguem o padrão de `toPublicConfig` em `routes/config.ts`: nunca devolvem a URL salva, só `{ aplicacaoSet, extensaoSet }`.

- [ ] **Step 5: Rodar os testes e confirmar sucesso**

Run: `cd server && npx vitest run src/routes/admin.test.ts`
Expected: PASS

- [ ] **Step 6: Montar `adminRouter` em `server/src/index.ts`**

Adicionar `import { adminRouter } from './routes/admin.js';` e `app.use('/api', adminRouter(CONFIG_PATH));` junto aos demais routers.

- [ ] **Step 7: Rodar toda a suíte do server**

Run: `cd server && npm test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
cd server && git add src/routes/admin.ts src/routes/admin.test.ts src/index.ts package.json package-lock.json
git commit -m "feat: adiciona rotas de admin protegidas por senha para os webhooks"
```

---

### Task 6: Tela de Admin no client

**Files:**
- Modify: `client/src/api/client.ts`
- Create: `client/src/components/AdminScreen.tsx`
- Modify: `client/src/components/BoardScreen.tsx`

**Interfaces:**
- Consumes: rotas `/api/admin/verify`, `/api/admin/webhooks` (Task 5).
- Produces (em `client/src/api/client.ts`):
  ```ts
  export interface AdminWebhooksStatus {
    aplicacaoSet: boolean;
    extensaoSet: boolean;
  }
  export function verifyAdminPassword(password: string): Promise<{ ok: true }>;
  export function getAdminWebhooks(password: string): Promise<AdminWebhooksStatus>;
  export function saveAdminWebhooks(password: string, input: { aplicacao?: string; extensao?: string }): Promise<AdminWebhooksStatus>;
  ```

- [ ] **Step 1: Adicionar as funções de API em `client/src/api/client.ts`**

`verifyAdminPassword` chama `request('/admin/verify', { method: 'POST', body: JSON.stringify({ password }) })`. `getAdminWebhooks`/`saveAdminWebhooks` passam o header `x-admin-password: password` via `init.headers` (mesclando com o `Content-Type` já fixo em `request`).

- [ ] **Step 2: Criar `AdminScreen.tsx` espelhando `SettingsScreen.tsx`**

Dois estágios no mesmo componente: (1) formulário só com campo de senha + botão "Entrar", chama `verifyAdminPassword`; erro mostra "Senha incorreta." sem detalhar mais. (2) após sucesso, chama `getAdminWebhooks(password)` e mostra dois campos de texto (URL do webhook de Aplicação, URL do webhook de Extensão) com placeholder "Deixe em branco para manter o atual" quando `aplicacaoSet`/`extensaoSet` for `true` (mesmo padrão de `passwordAlreadySet` em `SettingsScreen`), e um botão "Salvar" que chama `saveAdminWebhooks(password, { aplicacao, extensao })`. Props: `{ onCancel: () => void }` (sempre fecha sem navegação extra, diferente de `SettingsScreen` que pode não ter `onCancel`).

- [ ] **Step 3: Adicionar o botão "Admin" e o estado em `BoardScreen.tsx`**

Ao lado do botão "Configurações" (linha ~139): `<button onClick={() => setShowAdmin(true)} style={secondaryButtonStyle}>Admin</button>`, com `const [showAdmin, setShowAdmin] = useState(false);` e `{showAdmin && <AdminScreen onCancel={() => setShowAdmin(false)} />}` ao lado do bloco de `showSettings`.

- [ ] **Step 4: Rodar a suíte de testes do client para garantir que nada quebrou**

Run: `cd client && npm test`
Expected: PASS

- [ ] **Step 5: Teste manual no navegador**

Suba `npm run dev` no server e no client, abra o painel, clique em "Admin", confira: senha errada mostra erro; senha certa (`TEST_ADMIN_PASSWORD_PLACEHOLDER`) mostra os campos de webhook; salvar um webhook e reabrir a tela mostra o placeholder de "já configurado".

- [ ] **Step 6: Commit**

```bash
git add client/src/api/client.ts client/src/components/AdminScreen.tsx client/src/components/BoardScreen.tsx
git commit -m "feat: adiciona tela de Admin para cadastrar os webhooks de liberação antecipada"
```

---

### Task 7: Scheduler diário que liga tudo

**Files:**
- Create: `server/src/notifications/scheduler.ts`
- Test: `server/src/notifications/scheduler.test.ts`
- Modify: `server/src/index.ts`

**Interfaces:**
- Consumes: `computeDueNotifications` (Task 1), `readNotifiedState`/`writeNotifiedState`/`recordNotified` (Task 2), `formatEarlyDeliveryMessage`/`sendGoogleChatMessage` (Task 3), `readConfig`/`AppConfig` (Task 4), `fetchBoardData` de `server/src/jira/fetchBoardData.ts` (assinatura existente: `fetchBoardData(vertical, credentials, hoursPerPfBySprintId, hoursPerDayBySprintId, fallbackHoursPerDay)`).
- Produces:
  ```ts
  export async function runEarlyDeliveryCheck(configPath: string, notifiedStatePath: string): Promise<void>;
  export function startDailyEarlyDeliveryCheck(configPath: string, notifiedStatePath: string): void;
  ```

- [ ] **Step 1: Escrever os testes de `runEarlyDeliveryCheck`**

Use `vi.mock` para isolar as dependências externas (`fetchBoardData`, `sendGoogleChatMessage`) e arquivos de config/estado temporários reais (via `configStore`/`notifiedStore`, que já são testados isoladamente nas Tasks 2 e 4).

```ts
vi.mock('../jira/fetchBoardData.js', () => ({ fetchBoardData: vi.fn() }));
vi.mock('./googleChat.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, sendGoogleChatMessage: vi.fn() };
});

test('sem vertical/credenciais configuradas, não chama fetchBoardData e não lança', async () => {
  await writeConfig(tmpConfigPath, emptyConfig());
  await expect(runEarlyDeliveryCheck(tmpConfigPath, tmpNotifiedPath)).resolves.toBeUndefined();
  expect(fetchBoardData).not.toHaveBeenCalled();
});

test('tarefa elegível com sprint sem group configurado não envia e não marca como avisada', async () => {
  await writeConfig(tmpConfigPath, { ...fullConfig, sprintSettings: { s1: { ...sprintSettingsWithGroupNull } } });
  (fetchBoardData as Mock).mockResolvedValue({ today: '2026-10-22', sprints: [], activities: [earlyDeliveryActivity] });
  await runEarlyDeliveryCheck(tmpConfigPath, tmpNotifiedPath);
  expect(sendGoogleChatMessage).not.toHaveBeenCalled();
  expect(await readNotifiedState(tmpNotifiedPath)).toEqual({});
});

test('tarefa elegível com sprint de grupo "aplicacao" e webhook configurado envia e marca como avisada', async () => {
  await writeConfig(tmpConfigPath, { ...fullConfig, webhooks: { aplicacao: 'https://hook-a', extensao: null }, sprintSettings: { s1: { ...sprintSettingsGroupAplicacao } } });
  (fetchBoardData as Mock).mockResolvedValue({ today: '2026-10-22', sprints: [], activities: [earlyDeliveryActivity] });
  (sendGoogleChatMessage as Mock).mockResolvedValue({ ok: true });
  await runEarlyDeliveryCheck(tmpConfigPath, tmpNotifiedPath);
  expect(sendGoogleChatMessage).toHaveBeenCalledWith('https://hook-a', expect.any(String));
  const state = await readNotifiedState(tmpNotifiedPath);
  expect(state[earlyDeliveryActivity.key].milestones).toContain(5);
});

test('envio falha: não marca o marco como avisado', async () => {
  (fetchBoardData as Mock).mockResolvedValue({ today: '2026-10-22', sprints: [], activities: [earlyDeliveryActivity] });
  (sendGoogleChatMessage as Mock).mockResolvedValue({ ok: false, error: 'timeout' });
  await runEarlyDeliveryCheck(tmpConfigPathWithWebhook, tmpNotifiedPath);
  const state = await readNotifiedState(tmpNotifiedPath);
  expect(state[earlyDeliveryActivity.key]).toBeUndefined();
});
```

(Monte `earlyDeliveryActivity`, `fullConfig`, `sprintSettingsWithGroupNull`/`sprintSettingsGroupAplicacao` inline no teste com todos os campos obrigatórios dos respectivos tipos, como feito nas Tasks 1 e 4.)

- [ ] **Step 2: Rodar os testes e confirmar falha**

Run: `cd server && npx vitest run src/notifications/scheduler.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar `runEarlyDeliveryCheck`**

1. `config = await readConfig(configPath)`; se `!config.vertical || !config.jiraUsername || !config.jiraPassword`, loga e retorna (sem lançar).
2. Monta `hoursPerPfBySprintId`/`hoursPerDayBySprintId` a partir de `config.sprintSettings`, igual a `routes/boardData.ts:20-27`.
3. `const { today, activities } = await fetchBoardData(config.vertical, { username: config.jiraUsername, password: config.jiraPassword }, hoursPerPfBySprintId, hoursPerDayBySprintId, config.hoursPerDay ?? undefined)`.
4. `state = await readNotifiedState(notifiedStatePath)`.
5. `due = computeDueNotifications(activities, today, state)`.
6. Para cada `DueNotification`, nessa ordem: resolve `group = config.sprintSettings[notification.activity.sprintId]?.group ?? null`; se `null`, loga `"Sprint ${sprintId} sem grupo configurado — notificação de ${activity.key} ignorada."` e passa para a próxima; resolve `webhookUrl = config.webhooks[group]`; se `null`, loga `"Webhook de ${group} não configurado — notificação de ${activity.key} ignorada."` e passa para a próxima; senão chama `sendGoogleChatMessage(webhookUrl, formatEarlyDeliveryMessage(notification))` — em sucesso, `state = recordNotified(state, activity.key, activity.legalDeadline, notification.milestone)` e persiste (`await writeNotifiedState(notifiedStatePath, state)`, uma escrita por notificação enviada com sucesso, para não perder progresso se uma notificação posterior falhar); em falha, só loga o erro (`console.error`), sem persistir.

- [ ] **Step 4: Rodar os testes e confirmar sucesso**

Run: `cd server && npx vitest run src/notifications/scheduler.test.ts`
Expected: PASS

- [ ] **Step 5: Implementar `startDailyEarlyDeliveryCheck`**

Calcula o próximo horário às 08h (hoje às 08h se ainda não passou, senão amanhã às 08h), agenda com `setTimeout` a primeira execução e, dentro dela, roda `runEarlyDeliveryCheck` e reagenda a próxima com `setInterval(..., 24 * 60 * 60 * 1000)` (ou outro `setTimeout` recursivo — a critério do implementador, desde que a primeira execução ocorra no próximo 08h e as seguintes a cada 24h). Sem teste dedicado para esta função (ela só agenda; `runEarlyDeliveryCheck`, já testado, carrega toda a lógica).

- [ ] **Step 6: Chamar `startDailyEarlyDeliveryCheck` em `server/src/index.ts`**

Adicionar `const NOTIFIED_STATE_PATH = resolve(REPO_ROOT, 'notified.json');` junto às demais constantes de caminho, e `startDailyEarlyDeliveryCheck(CONFIG_PATH, NOTIFIED_STATE_PATH);` logo após montar os routers (antes de `app.listen`).

- [ ] **Step 7: Rodar toda a suíte do server**

Run: `cd server && npm test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
cd server && git add src/notifications/scheduler.ts src/notifications/scheduler.test.ts src/index.ts
git commit -m "feat: liga a checagem diária de liberação antecipada ao servidor"
```

---

## Depois de implementar

- Adicionar `ADMIN_PASSWORD=TEST_ADMIN_PASSWORD_PLACEHOLDER` ao `server/.env` local (não commitado) — necessário para as rotas de admin funcionarem; sem essa variável, `process.env.ADMIN_PASSWORD` é `undefined` e nenhuma senha autentica.
- Cadastrar os dois webhooks reais do Google Chat pela tela de Admin depois do deploy/início do servidor.
