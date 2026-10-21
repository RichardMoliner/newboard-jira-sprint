# Tempo por status (modal + gráfico de gargalo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconstruir, por story, quanto tempo ela passou em cada status do fluxo (Ainda não
iniciada → Em andamento → Em code review → Ag. início dos testes → Em testes → Aguardando
liberação → Concluída), expor isso numa modal por story na Timeline, e agregar a % média de tempo
por status (só stories concluídas) num novo gráfico nos Indicadores, pra apontar o gargalo do fluxo.

**Architecture:** O servidor já tem quase todos os sinais de data necessários (datas de
início/fim de Implementação e Teste, transição final pro status "concluída" via changelog da
story). Falta só a data em que a subtarefa de Implementação entrou em "Aguardando liberação para
testes" — buscada do changelog da PRÓPRIA subtarefa (novo fetch, mesmo padrão de cache por
`updated` já usado para o changelog da story). Uma função pura nova (`computeStatusHistory`)
combina todos esses sinais num array de segmentos `{status, start, end}` por story, anexado ao
`Activity` como `statusHistory`. O client consome esse array: a modal lista os segmentos como
vieram; o gráfico de Indicadores agrega a % de cada status, com uma função pura nova em
`computeIndicators.ts`.

**Tech Stack:** TypeScript, Express (server), React (client), Vitest (testes), sem bibliotecas de
gráfico — todo gráfico do projeto é SVG/CSS feito à mão.

**Spec:** `docs/superpowers/specs/2026-10-21-status-cycle-time-design.md`

## Global Constraints

- Duração de cada segmento em **dias corridos** (não dias úteis).
- Datas de fronteira dos segmentos truncadas pra granularidade de dia (`YYYY-MM-DD`), mesmo as que
  vêm do changelog com hora.
- O gráfico de % nos Indicadores só considera atividades com `isDone === true` (não
  `isCompleted`/`testDone` — ver seção "O que conta como concluída" da spec).
- Ordem dos status no gráfico de %: Ainda não iniciada, Em andamento, Em code review, Ag. início
  dos testes, Em testes, Aguardando liberação — "Concluída" fica de fora (terminal, sem % de
  bottleneck).
- Com mais de uma subtarefa de Implementação: usa a data **mais tardia (máx.)** entre as que
  realmente entraram em code review; se nenhuma entrou, o segmento "Em code review" não existe.
- Review reaberta: usa a **primeira** ocorrência da transição pra "Aguardando liberação para
  testes" no changelog da subtarefa (não a mais recente).
- Média de % por status = média simples das % de cada story concluída (sem peso por Story Points
  nem por duração do ciclo).
- Uma chamada HTTP a mais ao Jira por subtarefa de Implementação buscada (changelog), na mesma
  concorrência já usada pro changelog de story (`CHANGELOG_CONCURRENCY`).
- Cache em disco das sprints fechadas (`sprintCache.ts`) ganha um bump de versão — sprints já
  cacheadas antes desta mudança são tratadas como cache-miss e buscadas de novo no Jira.

## Review Focus

- Story `isDone` mas sem `implStartDate` registrado (anomalia de dado) — `computeStatusHistory`
  não pode lançar exceção; deve devolver uma lista mínima sã em vez de travar o fetch inteiro.
- Story ainda não iniciada (`notStarted`, sem nenhuma subtarefa de Implementação) — `statusHistory`
  deve ser um único segmento "Ainda não iniciada" em aberto até hoje, não uma lista vazia (a modal
  precisa ter o que mostrar pra QUALQUER story clicada).
- Story cuja Implementação nunca passou por "Aguardando liberação para testes" — o segmento "Em
  code review" deve ficar **ausente** da lista (não um segmento fantasma de 0 dias), senão a
  story puxaria a média de "Em code review" pra baixo mesmo sem nunca ter passado por lá.
- Story com mais de uma subtarefa de Implementação, só uma delas tendo entrado em code review — a
  agregação usa a data dessa, não trava nem ignora a story inteira.
- Sprint fechada já cacheada em disco ANTES desta mudança (JSON sem o campo `statusHistory`) — com
  o bump de versão do cache, isso deve virar cache-miss (refetch), não um crash tentando ler
  `statusHistory` undefined de um JSON antigo.

---

## Task 1: Versiona o cache de sprints fechadas

**Files:**
- Modify: `server/src/jira/sprintCache.ts`
- Test: `server/src/jira/sprintCache.test.ts`

**Interfaces:**
- Produces: `cachePath(cacheDir: string, sprintId: string): string` (já existe, privada — só muda o
  valor retornado).

- [ ] **Step 1: Write the failing test** — em `sprintCache.test.ts`, novo teste no `describe('sprintCache')`:

```ts
test('treats a cache file written before the version bump as a cache miss', async () => {
  const cacheDir = await tempCacheDir();
  await mkdir(cacheDir, { recursive: true });
  // Simula um arquivo de cache "antigo" (esquema pré-bump), escrito direto no disco sem passar por
  // writeCachedSprintData — deve ser ignorado, não lido.
  await writeFile(join(cacheDir, '7400.json'), JSON.stringify({ sprint, activities: [] }), 'utf-8');
  expect(await readCachedSprintData(cacheDir, '7400')).toBeNull();
});
```

Adicionar `mkdir` ao import de `node:fs/promises` no topo do arquivo de teste.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/jira/sprintCache.test.ts`
Expected: FAIL — o teste espera `null`, mas hoje `readCachedSprintData` acha e lê `7400.json` normalmente.

- [ ] **Step 3: Implement o bump de versão em `sprintCache.ts`**

Adiciona `const CACHE_VERSION = 2;` no topo do arquivo e muda `cachePath` para
`join(cacheDir, `${sprintId}.v${CACHE_VERSION}.json`)`. Nenhuma outra função do arquivo muda —
`readCachedSprintData`/`writeCachedSprintData` continuam chamando `cachePath` do jeito que já
chamam.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/jira/sprintCache.test.ts`
Expected: PASS (todos, incluindo os 4 testes já existentes — eles usam `cachePath` indiretamente e continuam passando com o novo esquema de nome).

- [ ] **Step 5: Commit**

```bash
git add server/src/jira/sprintCache.ts server/src/jira/sprintCache.test.ts
git commit -m "feat: bump sprint cache version to backfill status history on next fetch"
```

---

## Task 2: Função pura `computeStatusHistory`

**Files:**
- Create: `server/src/compute/statusHistory.ts`
- Test: `server/src/compute/statusHistory.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface StatusHistorySegment {
    status: string;
    start: string; // YYYY-MM-DD
    end: string;   // YYYY-MM-DD
  }

  export function computeStatusHistory(params: {
    storyCreated: string;                 // ISO datetime ou YYYY-MM-DD; truncado pra data
    implStartDate: string | null;         // YYYY-MM-DD
    implCodeReviewEnteredAt: string | null; // YYYY-MM-DD
    implDone: boolean;
    implDoneDate: string | null;          // YYYY-MM-DD
    firstTestWorklogDate: string | null;  // YYYY-MM-DD
    testDone: boolean;
    testDoneDate: string | null;          // YYYY-MM-DD
    isDone: boolean;
    doneTransitionDate: string | null;    // ISO datetime ou YYYY-MM-DD; truncado pra data
    storyUpdated: string;                 // ISO datetime ou YYYY-MM-DD; truncado pra data
    today: string;                        // YYYY-MM-DD
  }): StatusHistorySegment[]
  ```

Este é o algoritmo central da spec (tabela "Mapeamento técnico"). Cursor avança fase a fase; cada
fase só gera segmento se a fase anterior realmente aconteceu; a fase corrente (ainda não fechada)
usa `today` como fim.

- [ ] **Step 1: Write the failing tests** — em `statusHistory.test.ts`, cobrindo (pelo menos) estes casos, cada um com `toEqual`/`toHaveLength` nos segmentos exatos:

```ts
test('story not started yet: single open "Ainda não iniciada" segment ending today', () => { ... })
test('story in andamento, never reached code review, not done: 2 segments, last ends today', () => { ... })
test('story in code review, not done: 3 segments, "Em code review" ends today', () => { ... })
test('story skipped code review entirely (implCodeReviewEnteredAt null) but implDone: no "Em code review" segment in the list', () => { ... })
test('story implDone, test not started yet: 4 segments, "Ag. início dos testes" ends today', () => { ... })
test('story fully done, went through every phase: 7 segments, last is "Concluída" ending today, using doneTransitionDate as its start', () => { ... })
test('story fully done but storyUpdated used as fallback when doneTransitionDate is null', () => { ... })
test('truncates datetime inputs (storyCreated, doneTransitionDate, storyUpdated) to date-only in the segments', () => { ... })
test('isDone true but implStartDate is null (data anomaly): does not throw, returns a sane single segment instead of crashing the whole fetch', () => {
  const result = computeStatusHistory({
    storyCreated: '2026-09-01', implStartDate: null, implCodeReviewEnteredAt: null,
    implDone: false, implDoneDate: null, firstTestWorklogDate: null,
    testDone: false, testDoneDate: null, isDone: true, doneTransitionDate: '2026-09-05',
    storyUpdated: '2026-09-05', today: '2026-09-08',
  });
  expect(result).toEqual([{ status: 'Ainda não iniciada', start: '2026-09-01', end: '2026-09-05' }]);
});
```

Usar datas fixas tipo `'2026-09-01'`/`'2026-09-01T10:00:00.000-03:00'` nos inputs e checar
`start`/`end` exatos de cada segmento esperado (não só o `status`/tamanho da lista).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/compute/statusHistory.test.ts`
Expected: FAIL com "computeStatusHistory is not a function" (arquivo ainda não existe).

- [ ] **Step 3: Implement `computeStatusHistory` em `server/src/compute/statusHistory.ts`**

Segue o cursor sequencial da tabela da spec: 1) "Ainda não iniciada" de `dateOnly(storyCreated)`
até `implStartDate ?? (fim atual)` (se `implStartDate` é `null`, devolve só esse segmento e para —
cobre tanto a story que nunca começou quanto a anomalia de dado "isDone mas sem implStartDate", ver
Review Focus); 2) "Em andamento" até `implCodeReviewEnteredAt ?? implDoneDate ?? (fim atual)`; 3) "Em code
review" (só se `implCodeReviewEnteredAt` não é `null`) até `implDoneDate ?? (fim atual)`; se
`!implDone`, para aqui; 4) "Ag. início dos testes" até `firstTestWorklogDate ?? testDoneDate ??
(fim atual)`; se nem começou teste nem `testDone`, para aqui; 5) "Em testes" (só se
`firstTestWorklogDate` não é `null` ou `testDone`) até `testDoneDate ?? (fim atual)`; se
`!testDone`, para aqui; 6) "Aguardando liberação" até `(fim atual)`; se `!isDone`, para aqui; 7)
"Concluída" de `(fim atual)` até `today`. "Fim atual" em qualquer ponto = `isDone ?
dateOnly(doneTransitionDate ?? storyUpdated) : today`. Todas as datas de entrada passam por
`dateOnly()` (trunca pra `YYYY-MM-DD`, igual ao helper já usado em `mapActivity.ts`/
`groupSubtasks.ts`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/compute/statusHistory.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/compute/statusHistory.ts server/src/compute/statusHistory.test.ts
git commit -m "feat: add computeStatusHistory to reconstruct per-story status segments"
```

---

## Task 3: Busca a data de entrada em code review (changelog da subtarefa)

**Files:**
- Modify: `server/src/jira/fetchSprintEntry.ts` (exporta `fetchIssueChangelog`)
- Create: `server/src/jira/fetchImplCodeReviewDate.ts`
- Test: `server/src/jira/fetchImplCodeReviewDate.test.ts`

**Interfaces:**
- Consumes: `fetchIssueChangelog(issueKey: string, credentials: JiraCredentials): Promise<ChangelogHistory[]>` e o tipo `ChangelogHistory` de `./fetchSprintEntry.js` (hoje privados/parcialmente exportados).
- Produces:
  ```ts
  export function findStatusEnteredDate(histories: ChangelogHistory[], targetStatus: string): string | null
  export async function getImplCodeReviewEnteredAt(
    subtaskKey: string,
    updated: string,
    credentials: JiraCredentials,
  ): Promise<string | null>
  export function latestOrNull(dates: (string | null)[]): string | null
  ```
  `latestOrNull` é a regra de agregação de múltiplas subtarefas de Implementação (Global
  Constraints: usa a mais tardia entre as que têm data; se nenhuma tem, `null`) — extraída como
  função pura só pra poder ser testada (`fetchBoardData.ts`, que é quem a usa de fato, não tem
  suíte de testes própria hoje).

- [ ] **Step 1: Exportar `fetchIssueChangelog` em `fetchSprintEntry.ts`**

Em `server/src/jira/fetchSprintEntry.ts`, adiciona `export` na declaração de `function
fetchIssueChangelog(...)` (hoje privada). Nenhuma outra mudança nesse arquivo — `ChangelogHistory`
já é exportado.

- [ ] **Step 2: Write the failing tests** — em `fetchImplCodeReviewDate.test.ts`, só pra `findStatusEnteredDate` (mesmo estilo de `fetchSprintEntry.test.ts`):

```ts
import { describe, expect, test } from 'vitest';
import { findStatusEnteredDate } from './fetchImplCodeReviewDate.js';
import type { ChangelogHistory } from './fetchSprintEntry.js';

describe('findStatusEnteredDate', () => {
  test('returns null when there is no changelog history at all', () => {
    expect(findStatusEnteredDate([], 'Aguardando liberação para testes')).toBeNull();
  });

  test('returns null when no history item touches the status field', () => { ... });

  test('ignores status changes to a different status', () => { ... });

  test('matches case/accent-insensitively, same as groupSubtasks.isAwaitingCodeReviewStatus', () => {
    const histories = [{ created: '2026-09-10T09:00:00.000-0300', items: [{ field: 'status', toString: 'AGUARDANDO LIBERACAO PARA TESTES' }] }];
    expect(findStatusEnteredDate(histories, 'Aguardando liberação para testes')).toBe('2026-09-10T09:00:00.000-0300');
  });

  test('picks the FIRST occurrence by `created`, not the most recent (reopened review)', () => {
    const histories = [
      { created: '2026-09-12T09:00:00.000-0300', items: [{ field: 'status', toString: 'Aguardando liberação para testes' }] },
      { created: '2026-09-10T09:00:00.000-0300', items: [{ field: 'status', toString: 'Aguardando liberação para testes' }] },
    ];
    expect(findStatusEnteredDate(histories, 'Aguardando liberação para testes')).toBe('2026-09-10T09:00:00.000-0300');
  });
});

describe('latestOrNull', () => {
  test('returns null when every date is null (no subtask ever reached the status)', () => {
    expect(latestOrNull([null, null])).toBeNull();
  });

  test('returns the only non-null date when a single subtask reached it', () => {
    expect(latestOrNull([null, '2026-09-10'])).toBe('2026-09-10');
  });

  test('returns the LATEST date when more than one subtask reached it (code review only "complete" once the last one gets there)', () => {
    expect(latestOrNull(['2026-09-10', '2026-09-15', '2026-09-08'])).toBe('2026-09-15');
  });

  test('returns null for an empty list', () => {
    expect(latestOrNull([])).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/jira/fetchImplCodeReviewDate.test.ts`
Expected: FAIL — módulo ainda não existe.

- [ ] **Step 4: Implement `fetchImplCodeReviewDate.ts`**

`findStatusEnteredDate` normaliza (`normalize()` local, igual à de `groupSubtasks.ts`:
NFD + strip diacríticos + lowercase) tanto `targetStatus` quanto `item.toString`, filtra por
`field === 'status'`, ordena por `created` ascendente e devolve a **primeira**. `AWAITING_CODE_REVIEW_STATUS
= 'Aguardando liberação para testes'` como constante do módulo. `getImplCodeReviewEnteredAt` segue
o padrão de `getIssueHistoryFacts` em `fetchSprintEntry.ts`: `Map` de cache em nível de módulo
chaveado por `subtaskKey`, comparando `updated`; busca `fetchIssueChangelog(subtaskKey,
credentials)`, chama `findStatusEnteredDate(histories, AWAITING_CODE_REVIEW_STATUS)`; falha na
busca → loga e devolve `null` (não derruba o fetch, mesmo racional de `getIssueHistoryFacts`).
`latestOrNull(dates)` filtra os `null` e devolve o maior dos que sobraram (comparação de string
serve — datas `YYYY-MM-DD` ordenam lexicograficamente igual, mesmo estilo já usado em
`fetchBoardData.ts` pra achar o fim de sprint mais recente), ou `null` se a lista ficar vazia.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/jira/fetchImplCodeReviewDate.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/src/jira/fetchSprintEntry.ts server/src/jira/fetchImplCodeReviewDate.ts server/src/jira/fetchImplCodeReviewDate.test.ts
git commit -m "feat: fetch when an Implementação subtask first entered code review"
```

---

## Task 4: `groupSubtasks` expõe as chaves das subtarefas de Implementação por story

**Files:**
- Modify: `server/src/jira/groupSubtasks.ts`
- Test: `server/src/jira/groupSubtasks.test.ts`

**Interfaces:**
- Produces (novo campo em `GroupedSubtasks`): `implSubtaskKeysByParent: Map<string, string[]>` —
  todas as chaves de subtarefa "Implementação" de cada story pai (uma ou mais), na ordem em que
  aparecem na busca.

- [ ] **Step 1: Write the failing test** — novo `describe('implSubtaskKeysByParent')` em `groupSubtasks.test.ts`:

```ts
test('collects every Implementação subtask key per parent story', () => {
  const subtasks = [
    rawSubtask({ key: 'EC-10', type: 'Implementação', parent: { key: 'EC-1' } }),
    rawSubtask({ key: 'EC-11', type: 'Teste', parent: { key: 'EC-1' } }),
  ];
  const { implSubtaskKeysByParent } = groupSubtasks(subtasks);
  expect(implSubtaskKeysByParent.get('EC-1')).toEqual(['EC-10']);
});

test('supports more than one Implementação subtask for the same story', () => {
  const subtasks = [
    rawSubtask({ key: 'EC-10', type: 'Implementação', parent: { key: 'EC-1' } }),
    rawSubtask({ key: 'EC-12', type: 'Implementação', parent: { key: 'EC-1' } }),
  ];
  const { implSubtaskKeysByParent } = groupSubtasks(subtasks);
  expect(implSubtaskKeysByParent.get('EC-1')).toEqual(['EC-10', 'EC-12']);
});

test('has no entry for a story with no Implementação subtask', () => {
  const subtasks = [rawSubtask({ key: 'EC-11', type: 'Teste', parent: { key: 'EC-1' } })];
  const { implSubtaskKeysByParent } = groupSubtasks(subtasks);
  expect(implSubtaskKeysByParent.has('EC-1')).toBe(false);
});
```

(usar o `rawSubtask(...)` builder/helper já existente no topo de `groupSubtasks.test.ts` — seguir o
nome exato que já estiver lá.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/jira/groupSubtasks.test.ts`
Expected: FAIL — `implSubtaskKeysByParent` é `undefined`.

- [ ] **Step 3: Implement em `groupSubtasks.ts`**

Dentro do `if (subtask.type === 'Implementação')` (mesmo bloco que já popula
`implStartByParent`/`implStatusesByParent`/etc.), empurra `subtask.key` numa lista por
`parentKey` (`const implSubtaskKeysByParent = new Map<string, string[]>()`, inicializado antes do
loop). Adiciona ao objeto retornado e à interface `GroupedSubtasks`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/jira/groupSubtasks.test.ts`
Expected: PASS (62 testes: 59 já existentes + 3 novos)

- [ ] **Step 5: Commit**

```bash
git add server/src/jira/groupSubtasks.ts server/src/jira/groupSubtasks.test.ts
git commit -m "feat: expose Implementação subtask keys per parent story"
```

---

## Task 5: `Activity.statusHistory` — tipo + `mapActivity`

**Files:**
- Modify: `server/src/domain/types.ts`
- Modify: `server/src/domain/mapActivity.ts`
- Test: `server/src/domain/mapActivity.test.ts`

**Interfaces:**
- Consumes: `computeStatusHistory` e `StatusHistorySegment` de `../compute/statusHistory.js` (Task 2).
- Produces: `Activity.statusHistory: StatusHistorySegment[]` (novo campo, sempre presente — nunca
  `null`, no mínimo um segmento "Ainda não iniciada", ver Review Focus).

- [ ] **Step 1: Write the failing tests** — em `mapActivity.test.ts`, novo `describe('statusHistory')`:

```ts
test('includes the full status history, ending the current phase at `today` for a story still in progress', () => {
  const activity = mapActivity({
    story: baseStory({ storyPoints: 10 }),
    sprint,
    implStartDate: '2026-09-04',
    implAwaitingCodeReview: false,
    bugs: [],
    baseUrl: 'https://desenv.betha.com.br',
    today: '2026-09-08',
  });
  expect(activity.statusHistory).toEqual([
    { status: 'Ainda não iniciada', start: expect.any(String), end: '2026-09-04' },
    { status: 'Em andamento', start: '2026-09-04', end: '2026-09-08' },
  ]);
});

test('passes implCodeReviewEnteredAt through to computeStatusHistory', () => {
  const activity = mapActivity({
    story: baseStory({ storyPoints: 10 }),
    sprint,
    implStartDate: '2026-09-04',
    implCodeReviewEnteredAt: '2026-09-06',
    implDone: true,
    implDoneDate: '2026-09-07',
    bugs: [],
    baseUrl: 'https://desenv.betha.com.br',
    today: '2026-09-08',
  });
  expect(activity.statusHistory.map((s) => s.status)).toEqual(['Ainda não iniciada', 'Em andamento', 'Em code review', 'Ag. início dos testes']);
});

test('derives firstTestWorklogDate from worklogEntries for the status history boundary', () => {
  const activity = mapActivity({
    story: baseStory({ storyPoints: 10 }),
    sprint,
    implStartDate: '2026-09-01',
    implDone: true,
    implDoneDate: '2026-09-03',
    worklogEntries: [
      { subtaskType: 'Teste', author: 'Fulano', date: '2026-09-05', hours: 2, comment: null },
    ],
    bugs: [],
    baseUrl: 'https://desenv.betha.com.br',
    today: '2026-09-08',
  });
  const emTestes = activity.statusHistory.find((s) => s.status === 'Em testes');
  expect(emTestes?.start).toBe('2026-09-05');
});
```

(ajustar os `expect.any(String)`/datas exatas conforme o comportamento real de
`computeStatusHistory` — usar `baseStory`/`sprint` helpers já existentes no arquivo.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/domain/mapActivity.test.ts`
Expected: FAIL — `activity.statusHistory` é `undefined`.

- [ ] **Step 3: Adicionar `StatusHistorySegment` e o campo em `types.ts`**

Em `server/src/domain/types.ts`, acrescenta (mesmo padrão de `TimelineWindow`, que também é
redeclarado localmente em vez de importado de `compute/`):

```ts
export interface StatusHistorySegment {
  status: string;
  start: string;
  end: string;
}
```

E adiciona `statusHistory: StatusHistorySegment[];` na interface `Activity` (perto de
`implWindow`/`testWindow`, com um comentário curto apontando que vem de `computeStatusHistory`).

- [ ] **Step 4: Implement em `mapActivity.ts`**

Adiciona `implCodeReviewEnteredAt?: string | null` aos params de `mapActivity` (default `null`).
Ao lado de `hasTestWorklog` (linha ~165), computa
`const firstTestWorklogDate = worklogEntries.find((e) => e.subtaskType === 'Teste')?.date ?? null;`.
Depois de calcular `deliveredDate`/`status` (ou em qualquer ponto antes do `return`), chama:

```ts
const statusHistory = computeStatusHistory({
  storyCreated: story.created,
  implStartDate,
  implCodeReviewEnteredAt,
  implDone,
  implDoneDate,
  firstTestWorklogDate,
  testDone,
  testDoneDate,
  isDone,
  doneTransitionDate,
  storyUpdated: story.updated,
  today,
});
```

Importa `computeStatusHistory` de `../compute/statusHistory.js`. Adiciona `statusHistory` ao objeto
`Activity` retornado.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/domain/mapActivity.test.ts src/domain/types.ts`
Expected: PASS (93 testes já existentes + os novos)

- [ ] **Step 6: Commit**

```bash
git add server/src/domain/types.ts server/src/domain/mapActivity.ts server/src/domain/mapActivity.test.ts
git commit -m "feat: attach computed statusHistory to each Activity"
```

---

## Task 6: `fetchBoardData` busca e agrega a data de code review por story

**Files:**
- Modify: `server/src/jira/fetchBoardData.ts`

**Interfaces:**
- Consumes: `implSubtaskKeysByParent` de `groupSubtasks` (Task 4); `getImplCodeReviewEnteredAt` e
  `latestOrNull` de `./fetchImplCodeReviewDate.js` (Task 3); `mapActivity({ ...,
  implCodeReviewEnteredAt })` (Task 5).
- Produces: nenhuma interface nova pra fora deste arquivo — é só fiação interna de
  `fetchActivitiesForSprintScope`.

Não existe `fetchBoardData.test.ts` hoje (confirmado) — esta é uma tarefa de integração, validada
por `tsc` e pelas suítes das Tasks 2–5 (a lógica de verdade, incluindo a regra de agregação de
múltiplas subtarefas, já está testada em `latestOrNull`, Task 3).

- [ ] **Step 1: Modify `fetchActivitiesForSprintScope` em `fetchBoardData.ts`**

Importa `getImplCodeReviewEnteredAt, latestOrNull` de `./fetchImplCodeReviewDate.js`. Depois de
destructurar `groupSubtasks(...)` (linha ~117), inclui `implSubtaskKeysByParent` na
destructuring. Logo após o bloco de `historyFactPairs`/`historyFactsByStoryKey` (linha ~175-181),
adiciona:

```ts
const implSubtaskUpdatedByKey = new Map(
  subtasksWithFullWorklogs.filter((s) => s.type === 'Implementação').map((s) => [s.key, s.updated] as const),
);
const allImplSubtaskKeys = [...implSubtaskKeysByParent.values()].flat();
report('Buscando histórico de code review...');
const codeReviewPairs = await mapWithConcurrency(allImplSubtaskKeys, CHANGELOG_CONCURRENCY, async (subtaskKey) => {
  const updated = implSubtaskUpdatedByKey.get(subtaskKey)!;
  const enteredAt = await getImplCodeReviewEnteredAt(subtaskKey, updated, credentials);
  return [subtaskKey, enteredAt] as const;
});
const codeReviewEnteredAtBySubtaskKey = new Map(codeReviewPairs);

const implCodeReviewEnteredAtByParent = new Map<string, string | null>();
for (const [parentKey, subtaskKeys] of implSubtaskKeysByParent) {
  implCodeReviewEnteredAtByParent.set(
    parentKey,
    latestOrNull(subtaskKeys.map((k) => codeReviewEnteredAtBySubtaskKey.get(k) ?? null)),
  );
}
```

No `mapActivity({...})` dentro do `for (const story of storyDetails)` (linha ~191-223), adiciona
`implCodeReviewEnteredAt: implCodeReviewEnteredAtByParent.get(story.key) ?? null,`.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Run the full server test suite (regressão)**

Run: `npx vitest run`
Expected: PASS em todos os arquivos (nenhum teste existente deveria ter sido afetado por esta
tarefa — ela só liga peças já testadas isoladamente).

- [ ] **Step 4: Commit**

```bash
git add server/src/jira/fetchBoardData.ts
git commit -m "feat: fetch and aggregate code-review-entered date per story"
```

---

## Task 7: Tipo `Activity.statusHistory` no client

**Files:**
- Modify: `client/src/types.ts`

**Interfaces:**
- Produces: `StatusHistorySegment` (mesma forma do server) e `Activity.statusHistory:
  StatusHistorySegment[]`.

- [ ] **Step 1: Adicionar o tipo e o campo em `client/src/types.ts`**

Mesmo padrão de `TimelineWindow` já duplicado ali — adiciona:

```ts
export interface StatusHistorySegment {
  status: string;
  start: string;
  end: string;
}
```

E `statusHistory: StatusHistorySegment[];` na interface `Activity`.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros (nenhum outro arquivo client usa `Activity` com checagem exaustiva de campos
que quebraria por um campo novo opcional... na verdade o campo é obrigatório, então qualquer
`activity({...})` builder de teste que monta um `Activity` literal à mão vai precisar do campo —
rodar o typecheck aqui é só pra confirmar que não há tal builder ainda fora do que as Tasks 8/9 vão
tocar; se houver, ajustar os builders de teste existentes nesta mesma tarefa).

- [ ] **Step 3: Commit**

```bash
git add client/src/types.ts
git commit -m "feat: add statusHistory to the client Activity type"
```

---

## Task 8: `computeStatusCycleTime` nos Indicadores

**Files:**
- Modify: `client/src/indicators/computeIndicators.ts`
- Test: `client/src/indicators/computeIndicators.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface StatusCycleTimeSummary {
    status: string;
    averagePercent: number;
  }
  export function computeStatusCycleTime(activities: Activity[]): StatusCycleTimeSummary[]
  ```
  Sempre devolve uma entrada pra cada um dos 6 status da ordem do ciclo (mesmo com `averagePercent:
  0` quando nenhuma story concluída passou por aquele status), na ordem fixa.

- [ ] **Step 1: Write the failing tests** — novo `describe('computeStatusCycleTime')`:

```ts
function segment(status: string, start: string, end: string) { return { status, start, end }; }

test('returns all 6 cycle statuses with 0% when there are no completed activities', () => {
  const result = computeStatusCycleTime([activity({ isDone: false })]);
  expect(result).toEqual([
    { status: 'Ainda não iniciada', averagePercent: 0 },
    { status: 'Em andamento', averagePercent: 0 },
    { status: 'Em code review', averagePercent: 0 },
    { status: 'Ag. início dos testes', averagePercent: 0 },
    { status: 'Em testes', averagePercent: 0 },
    { status: 'Aguardando liberação', averagePercent: 0 },
  ]);
});

test('computes the % breakdown of a single completed story\'s own cycle', () => {
  const activities = [activity({
    isDone: true,
    statusHistory: [
      segment('Ainda não iniciada', '2026-09-01', '2026-09-02'), // 1 dia
      segment('Em andamento', '2026-09-02', '2026-09-06'),       // 4 dias
      segment('Aguardando liberação', '2026-09-06', '2026-09-07'), // 1 dia
      segment('Concluída', '2026-09-07', '2026-09-07'),          // ignorado
    ],
  })];
  // total não-terminal = 6 dias
  const result = computeStatusCycleTime(activities);
  expect(result.find((r) => r.status === 'Ainda não iniciada')?.averagePercent).toBeCloseTo((1 / 6) * 100);
  expect(result.find((r) => r.status === 'Em andamento')?.averagePercent).toBeCloseTo((4 / 6) * 100);
  expect(result.find((r) => r.status === 'Em code review')?.averagePercent).toBe(0);
});

test('averages equally across stories, not weighted by story points or cycle length', () => {
  // story A: ciclo de 2 dias, 50%/50%; story B: ciclo de 20 dias, 90%/10% — média simples das %, não dos dias.
  const activities = [
    activity({ key: 'A', isDone: true, storyPoints: 1, statusHistory: [segment('Em andamento', '2026-09-01', '2026-09-02'), segment('Em testes', '2026-09-02', '2026-09-03')] }),
    activity({ key: 'B', isDone: true, storyPoints: 100, statusHistory: [segment('Em andamento', '2026-09-01', '2026-09-19'), segment('Em testes', '2026-09-19', '2026-09-21')] }),
  ];
  const result = computeStatusCycleTime(activities);
  // A: Em andamento 50%, Em testes 50%. B: Em andamento 90%, Em testes 10%. Média: 70% / 30%.
  expect(result.find((r) => r.status === 'Em andamento')?.averagePercent).toBeCloseTo(70);
  expect(result.find((r) => r.status === 'Em testes')?.averagePercent).toBeCloseTo(30);
});

test('excludes activities that are not isDone, even if testDone (functionally complete)', () => {
  const activities = [activity({ isDone: false, testDone: true, statusHistory: [segment('Aguardando liberação', '2026-09-01', '2026-09-10')] })];
  const result = computeStatusCycleTime(activities);
  expect(result.every((r) => r.averagePercent === 0)).toBe(true);
});

test('skips a story whose total non-terminal duration is 0 (avoids divide-by-zero)', () => {
  const activities = [activity({ isDone: true, statusHistory: [segment('Concluída', '2026-09-01', '2026-09-01')] })];
  expect(() => computeStatusCycleTime(activities)).not.toThrow();
});
```

(usar o `activity({...})` builder já existente no topo de `computeIndicators.test.ts`, passando
`statusHistory` nos overrides — ajustar o builder pra aceitar/default `statusHistory: []` se ele
ainda não tiver esse campo, já que `Activity` ganhou um campo obrigatório na Task 7.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/indicators/computeIndicators.test.ts`
Expected: FAIL — `computeStatusCycleTime` não existe (e possivelmente o builder `activity()`
reclama de `statusHistory` faltando — resolver isso primeiro, como parte deste mesmo passo, antes
de rodar).

- [ ] **Step 3: Implement em `computeIndicators.ts`**

```ts
const CYCLE_STATUS_ORDER = ['Ainda não iniciada', 'Em andamento', 'Em code review', 'Ag. início dos testes', 'Em testes', 'Aguardando liberação'];

function daysBetween(startISO: string, endISO: string): number {
  return Math.round((Date.parse(endISO) - Date.parse(startISO)) / (24 * 60 * 60 * 1000));
}

export interface StatusCycleTimeSummary {
  status: string;
  averagePercent: number;
}

export function computeStatusCycleTime(activities: Activity[]): StatusCycleTimeSummary[] {
  const percentsByStatus = new Map<string, number[]>();

  for (const activity of activities) {
    if (!activity.isDone) continue;
    const nonTerminal = activity.statusHistory.filter((s) => s.status !== 'Concluída');
    const totalDays = sum(nonTerminal.map((s) => daysBetween(s.start, s.end)));
    if (totalDays <= 0) continue;
    for (const segment of nonTerminal) {
      const percent = (daysBetween(segment.start, segment.end) / totalDays) * 100;
      const list = percentsByStatus.get(segment.status) ?? [];
      list.push(percent);
      percentsByStatus.set(segment.status, list);
    }
  }

  return CYCLE_STATUS_ORDER.map((status) => {
    const list = percentsByStatus.get(status) ?? [];
    return { status, averagePercent: list.length > 0 ? sum(list) / list.length : 0 };
  });
}
```

Reusa o `sum()` já existente no fim do arquivo.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/indicators/computeIndicators.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/indicators/computeIndicators.ts client/src/indicators/computeIndicators.test.ts
git commit -m "feat: compute average % of cycle time per status for completed activities"
```

---

## Task 9: Gráfico de gargalo nos Indicadores

**Files:**
- Create: `client/src/components/StatusBottleneckChart.tsx`
- Modify: `client/src/components/IndicatorsView.tsx`

**Interfaces:**
- Consumes: `StatusCycleTimeSummary` e `computeStatusCycleTime` de `../indicators/computeIndicators.js` (Task 8).
- Produces: `export default function StatusBottleneckChart({ summaries }: { summaries: StatusCycleTimeSummary[] }): JSX.Element`.

Sem teste dedicado — é um componente só de apresentação (mesmo padrão de `BurndownChart.tsx`,
que também não tem `.test.ts`); a lógica de verdade já foi testada na Task 8.

- [ ] **Step 1: Antes de desenhar, carregar a skill `dataviz`** (já disponível no projeto) pra manter
  paleta/consistência visual com `StatusPieChart`/`BurndownChart`.

- [ ] **Step 2: Implement `StatusBottleneckChart.tsx`**

Barras horizontais, uma por item de `summaries` (já vem na ordem certa de
`computeStatusCycleTime`), largura proporcional a `averagePercent` (sobre 100%, não sobre o maior
valor — pra comparar visualmente entre status), rótulo com o nome do status + `%` arredondada.
Mensagem `"Sem tarefas concluídas no recorte atual."` quando todas as entradas são 0%.

- [ ] **Step 3: Import e renderiza no `IndicatorsView.tsx`**

Importa `StatusBottleneckChart` e `computeStatusCycleTime`. Adiciona
`const statusCycleTime = useMemo(() => computeStatusCycleTime(indicatorActivities), [indicatorActivities]);`
perto dos outros `useMemo` de indicador (linha ~94). Adiciona uma nova `<Section title="Gargalo do
fluxo (% médio de tempo por status, tarefas concluídas)">` com `<StatusBottleneckChart
summaries={statusCycleTime} />`, ao lado da Section "Atividades por status" (linha ~344-346).

- [ ] **Step 4: Rodar o client e conferir visualmente**

Run: `npm run dev` (client) e abrir a aba Indicadores — confirmar que o gráfico aparece e as barras
somam ≈100% (exceto arredondamento) quando há tarefas concluídas no recorte.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/StatusBottleneckChart.tsx client/src/components/IndicatorsView.tsx
git commit -m "feat: add bottleneck chart (avg % time per status) to Indicadores"
```

---

## Task 10: Modal de histórico de status por story, na Timeline

**Files:**
- Create: `client/src/components/StatusHistoryModal.tsx`
- Test: `client/src/components/StatusHistoryModal.test.ts`
- Modify: `client/src/components/TimelineView.tsx:874-884` (bloco do título/link da story em `ActivityRow`)

**Interfaces:**
- Consumes: `Activity.statusHistory` (Task 7).
- Produces:
  ```ts
  export function formatDurationDays(days: number): string // "0 dias" | "1 dia" | "N dias"
  export default function StatusHistoryModal({ activity, onClose }: { activity: Activity; onClose: () => void }): JSX.Element
  ```

- [ ] **Step 1: Write the failing test** — `StatusHistoryModal.test.ts` (só a função pura
  `formatDurationDays`, mesmo padrão de `StatusPieChart.test.ts`):

```ts
import { describe, expect, test } from 'vitest';
import { formatDurationDays } from './StatusHistoryModal.js';

describe('formatDurationDays', () => {
  test('pluralizes correctly: 0 dias', () => { expect(formatDurationDays(0)).toBe('0 dias'); });
  test('pluralizes correctly: 1 dia (singular)', () => { expect(formatDurationDays(1)).toBe('1 dia'); });
  test('pluralizes correctly: N dias', () => { expect(formatDurationDays(5)).toBe('5 dias'); });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/StatusHistoryModal.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implement `StatusHistoryModal.tsx`**

`formatDurationDays(days: number): string` — `` `${days} dia${days === 1 ? '' : 's'}` ``. O
componente segue o mesmo estilo visual de overlay/card de `SprintSettingsPopup.tsx` (`position:
fixed; inset: 0` com fundo escurecido + card central), listando `activity.statusHistory` na ordem
em que vem (já cronológica), cada linha: nome do status + `formatDurationDays(diasEntreStartEEnd)`
(dias = mesma conta de `daysBetween`, pode duplicar a fórmula local — 2 linhas, não vale extrair
compartilhado com o client agora). Título da modal com `activity.key` / `activity.title`. Botão
"Fechar" chamando `onClose`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/StatusHistoryModal.test.ts`
Expected: PASS

- [ ] **Step 5: Adicionar o ícone ℹ️ e o estado local em `ActivityRow` (`TimelineView.tsx`)**

Dentro de `ActivityRow` (função que já recebe `activity: Activity` como prop — não precisa de prop
nova), adiciona `const [showStatusHistory, setShowStatusHistory] = useState(false);` e importa
`StatusHistoryModal`. No bloco do título (linha ~874-884, ao lado do link
`{activity.key} - {activity.title}`), adiciona um botão:

```tsx
<button
  onClick={() => setShowStatusHistory(true)}
  title="Ver tempo em cada status"
  style={{ background: 'none', border: 'none', padding: 0, marginLeft: 6, fontSize: 11, cursor: 'pointer', opacity: 0.7 }}
>
  ℹ️
</button>
{showStatusHistory && <StatusHistoryModal activity={activity} onClose={() => setShowStatusHistory(false)} />}
```

(mesmo padrão visual/de opacidade do botão ⚙️ já existente em outro lugar do arquivo.)

- [ ] **Step 6: Rodar o client e conferir visualmente**

Run: `npm run dev` (client) — abrir a Timeline, clicar no ℹ️ de uma story, conferir que a modal
abre com a lista de status/dias e fecha ao clicar em "Fechar".

- [ ] **Step 7: Run the full client test suite (regressão)**

Run: `npx vitest run`
Expected: PASS em todos os arquivos.

- [ ] **Step 8: Commit**

```bash
git add client/src/components/StatusHistoryModal.tsx client/src/components/StatusHistoryModal.test.ts client/src/components/TimelineView.tsx
git commit -m "feat: add per-story status history modal to the Timeline"
```
