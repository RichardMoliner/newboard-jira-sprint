# Projeção da próxima tarefa na fila — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For each developer in the Linha do tempo, project an Implementação
window for their next not-started queued activity (one dashed "PROJEÇÃO" bar),
and make the "Disponível a partir de" label (renamed "Projeção de
disponibilidade em") account for that queued work, not just what's currently
in progress.

**Architecture:** Pure, derived client-side computation (no server/`Activity`
shape change beyond one new read-only field, `createdDate`, needed to
implement the "skipped the queue" ordering rule). Two new pure functions in
`TimelineView.tsx` (`resolveNextQueuedActivity`, `projectNextQueuedWindow`)
feed a `useMemo` that's looked up per developer in the existing render loop;
a new presentational `ProjectedQueueBar` renders the dashed box, reusing
`computeTimeline` for the actual projection math.

**Tech Stack:** TypeScript, React, Vitest (existing stack, no new deps).

**Spec:** `docs/superpowers/specs/2026-11-11-proximo-queue-projection-design.md`

## Global Constraints

- Reuse `computeTimeline(storyPoints, startISO, hoursPerPf, hoursPerDay)` from
  `client/src/compute/timeline.ts` for the projection math — do not
  reimplement the 70/30 Impl/Teste or business-day logic.
- `hoursPerPf` for the projection must come from the queued activity's own
  sprint (`hoursPerPfBySprintId[activity.sprintId]`), not a global constant.
- The queue/"next" computation always operates on the developer's full
  cross-sprint activity list (`byDeveloperAcrossAllSprints`), matching how
  `projectDeveloperAvailabilityDate` already works today — never on the
  sprint/search-filtered list.
- No server-side change to the projection logic itself — `mapActivity.ts`
  only gains the new `createdDate` field; everything else is a client
  computation, same pattern as `projectDeveloperAvailabilityDate` today.
- Label text: "Disponível a partir de" → "Projeção de disponibilidade em",
  everywhere it's shown (single occurrence today, `TimelineView.tsx:619`).
- Visual style: dashed border box, `var(--series-impl)` color, no fill,
  "PROJEÇÃO" label centered inside (validated in the brainstorm prototype,
  option A).

## Review Focus

- A queued activity with `storyPoints === null` must not render a broken bar
  or crash — falls back to today's plain "ainda não iniciada" text, no
  projection/label change for that dev. (Task 3, Task 4)
- A developer who is fully available right now (no real Impl. work in
  progress) but has a queued not-started activity must NOT show a projection
  bar or label — showing "✓ Disponível" next to a future date would be
  confusing; this is an explicit non-goal. (Task 3)
- The computed "next" queued activity can legitimately not be among the
  currently filtered/rendered rows for that developer (sprint filter, search,
  "Ocultar concluídas", legend filters) — the label may show a date with no
  visible matching bar; must never crash or attach the bar to the wrong
  activity's row. (Task 4)
- A developer picks up (starts) an activity that is not the earliest-created
  not-started one — the skipped activity must move to the back of that
  developer's not-started queue on the very next computation, with no stored
  state. (Task 2)
- Two not-started activities created on the exact same `createdDate` (tie)
  must sort deterministically, not crash or flicker between renders. (Task 2)

---

## Task 1: Server — expose `createdDate` on `Activity`

**Files:**
- Modify: `server/src/domain/types.ts` (`Activity` interface, after `startDate: string;`)
- Modify: `server/src/domain/mapActivity.ts` (return object, after `startDate,`)
- Test: `server/src/domain/mapActivity.test.ts`

**Interfaces:**
- Produces: `Activity.createdDate: string` — `story.created`, date-only
  (`YYYY-MM-DD`), always present (unlike `startDate`, which already carries
  different meanings for started vs. not-started activities — `createdDate`
  is always the Jira creation date, regardless of status).

- [ ] **Step 1: Write the failing test**

```ts
test('createdDate reflects the story creation date (date-only), regardless of whether implementation has started', () => {
  const activity = mapActivity({
    story: baseStory(), // created: '2026-07-08T10:26:04.000-0300' (default)
    sprint,
    implStartDate: '2026-08-04',
    bugs: [],
    baseUrl: 'https://desenv.betha.com.br',
    today: '2026-09-08',
  });
  expect(activity.createdDate).toBe('2026-07-08');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace server -- mapActivity`
Expected: FAIL — `activity.createdDate` is `undefined`.

- [ ] **Step 3: Add `createdDate: string` to the `Activity` interface in `server/src/domain/types.ts`, and set `createdDate: dateOnly(story.created)` in the return object of `mapActivity` in `server/src/domain/mapActivity.ts`**

`dateOnly` is already a local function in `mapActivity.ts` (used for
`startDate`'s fallback) — reuse it directly, no new helper needed.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace server -- mapActivity`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/domain/types.ts server/src/domain/mapActivity.ts server/src/domain/mapActivity.test.ts
git commit -m "feat: expose createdDate on Activity"
```

---

## Task 2: Client — `resolveNextQueuedActivity` (queue ordering + skip rule)

**Files:**
- Modify: `client/src/types.ts` (`Activity` interface, mirror Task 1's field)
- Modify: `client/src/components/TimelineView.tsx` (new exported function, placed next to `groupByDeveloper`, `~line 2378`)
- Modify (prep, non-test): `client/src/components/TimelineView.test.ts`, `client/src/compute/recomputeActivity.test.ts`, `client/src/indicators/computeIndicators.test.ts`, `client/src/components/ReportView.test.ts` — each has its own local `activity()`/full-`Activity`-literal factory that needs a `createdDate` default added so the project still compiles.
- Test: `client/src/components/TimelineView.test.ts`

**Interfaces:**
- Consumes: `Activity.createdDate` (Task 1/this task's type mirror), `Activity.notStarted`.
- Produces: `export function resolveNextQueuedActivity(activities: Activity[]): Activity | null` — `activities` is one developer's full (cross-sprint) activity list.

- [ ] **Step 1 (prep, not a test): add `createdDate: string` to the `Activity` interface in `client/src/types.ts` (mirroring Task 1, same position after `startDate`), then add a `createdDate: '2026-07-08'` (or any valid date matching that factory's existing `startDate`-ish defaults) default to each of the 4 test factories listed above so the project type-checks.**

Run `npm test --workspace client` once after this step just to confirm it
still compiles/passes with no behavior change (no new assertions yet).

- [ ] **Step 2: Write the failing tests**

```ts
describe('resolveNextQueuedActivity', () => {
  test('returns null when the developer has no notStarted activity', () => {
    expect(resolveNextQueuedActivity([activity({ notStarted: false })])).toBeNull();
  });

  test('returns the only notStarted activity when there is just one', () => {
    const a = activity({ key: 'A', notStarted: true, createdDate: '2026-09-01' });
    expect(resolveNextQueuedActivity([a])).toBe(a);
  });

  test('returns the earliest-created notStarted activity when none were skipped', () => {
    const older = activity({ key: 'A', notStarted: true, createdDate: '2026-09-01' });
    const newer = activity({ key: 'B', notStarted: true, createdDate: '2026-09-05' });
    expect(resolveNextQueuedActivity([newer, older])?.key).toBe('A');
  });

  test('does not consider an activity skipped when the already-started sibling was created before it (normal prioritization)', () => {
    const olderStartedB = activity({ key: 'B', notStarted: false, createdDate: '2026-08-20' });
    const newerA = activity({ key: 'A', notStarted: true, createdDate: '2026-09-01' });
    expect(resolveNextQueuedActivity([olderStartedB, newerA])?.key).toBe('A');
  });

  test('pushes a skipped notStarted activity to the back of the queue, behind a not-yet-skipped one', () => {
    // A foi criada primeiro (01/09) mas o dev já iniciou B, criada depois (05/09) — A foi pulada.
    const skippedA = activity({ key: 'A', notStarted: true, createdDate: '2026-09-01' });
    const startedB = activity({ key: 'B', notStarted: false, createdDate: '2026-09-05' });
    const nextC = activity({ key: 'C', notStarted: true, createdDate: '2026-09-08' });
    expect(resolveNextQueuedActivity([skippedA, startedB, nextC])?.key).toBe('C');
  });

  test('a skipped notStarted activity is still returned as next when it is the only one in queue', () => {
    const skippedA = activity({ key: 'A', notStarted: true, createdDate: '2026-09-01' });
    const doneB = activity({ key: 'B', notStarted: false, isDone: true, createdDate: '2026-09-05' });
    expect(resolveNextQueuedActivity([skippedA, doneB])?.key).toBe('A');
  });

  test('sorts two skipped activities between themselves by createdDate too', () => {
    const skippedOlder = activity({ key: 'A', notStarted: true, createdDate: '2026-09-01' });
    const skippedNewer = activity({ key: 'B', notStarted: true, createdDate: '2026-09-03' });
    const startedC = activity({ key: 'C', notStarted: false, createdDate: '2026-09-10' });
    expect(resolveNextQueuedActivity([skippedNewer, skippedOlder, startedC])?.key).toBe('A');
  });

  test('two notStarted activities with the exact same createdDate sort deterministically (no crash)', () => {
    const a = activity({ key: 'A', notStarted: true, createdDate: '2026-09-01' });
    const b = activity({ key: 'B', notStarted: true, createdDate: '2026-09-01' });
    expect(() => resolveNextQueuedActivity([a, b])).not.toThrow();
    expect(['A', 'B']).toContain(resolveNextQueuedActivity([a, b])?.key);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test --workspace client -- TimelineView`
Expected: FAIL — `resolveNextQueuedActivity` is not exported/defined.

- [ ] **Step 4: Implement `export function resolveNextQueuedActivity(activities: Activity[]): Activity | null` in `client/src/components/TimelineView.tsx`**

Filter to `notStarted` activities. An activity is "skipped" when some other
activity in the full list has `notStarted === false` and a `createdDate`
strictly greater than its own. Sort: non-skipped before skipped; within each
group, ascending `createdDate` (`localeCompare`, ties keep array order —
`Array.prototype.sort` is stable). Return the first element, or `null` if
the filtered list is empty.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test --workspace client -- TimelineView`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add client/src/types.ts client/src/components/TimelineView.tsx client/src/components/TimelineView.test.ts client/src/compute/recomputeActivity.test.ts client/src/indicators/computeIndicators.test.ts client/src/components/ReportView.test.ts
git commit -m "feat: add resolveNextQueuedActivity queue-ordering rule"
```

---

## Task 3: Client — `projectNextQueuedWindow` (the projection itself)

**Files:**
- Modify: `client/src/components/TimelineView.tsx` (new exported function next to `projectDeveloperAvailabilityDate`, `~line 2401`; add `import { computeTimeline } from '../compute/timeline.js';` near the top imports)
- Test: `client/src/components/TimelineView.test.ts` (add `computeTimeline` to its import from `../compute/timeline.js` for building test expectations)

**Interfaces:**
- Consumes: `resolveNextQueuedActivity` (Task 2), `projectDeveloperAvailabilityDate` (existing), `computeTimeline` (existing, `client/src/compute/timeline.ts`), `TimelineWindow` (existing type).
- Produces: `export function projectNextQueuedWindow(activities: Activity[], today: string, hoursPerDay: number, hoursPerPfBySprintId: Record<string, number>): { activityKey: string; window: TimelineWindow } | null`

- [ ] **Step 1: Write the failing tests**

```ts
describe('projectNextQueuedWindow', () => {
  test('null when the developer has no notStarted activity in queue', () => {
    expect(projectNextQueuedWindow([activity({ notStarted: false, implDone: true })], '2026-09-01', 8, { S1: 4 })).toBeNull();
  });

  test('null when the developer is already fully available (no real pending work to anchor the projection on)', () => {
    const queued = activity({ key: 'Q', notStarted: true, storyPoints: 16, createdDate: '2026-09-01' });
    const done = activity({ key: 'D', notStarted: false, implDone: true });
    expect(projectNextQueuedWindow([queued, done], '2026-09-01', 6.5, { S1: 4 })).toBeNull();
  });

  test('null when the next queued activity has no storyPoints', () => {
    const inProgress = activity({ key: 'P', notStarted: false, implDone: false, implEstimatedHours: 10, implLoggedHours: 0 });
    const queued = activity({ key: 'Q', notStarted: true, storyPoints: null, createdDate: '2026-09-01' });
    expect(projectNextQueuedWindow([inProgress, queued], '2026-09-01', 8, { S1: 4 })).toBeNull();
  });

  test('projects the Impl window of the next queued activity, anchored on when the dev frees from current real work, using that activity\'s own sprint hoursPerPf', () => {
    const inProgress = activity({ key: 'P', notStarted: false, implDone: false, implEstimatedHours: 20, implLoggedHours: 0 });
    const queued = activity({ key: 'Q', notStarted: true, storyPoints: 16, createdDate: '2026-09-01', sprintId: 'S9' });
    const all = [inProgress, queued];
    const hoursPerPfBySprintId = { S9: 4 };
    const result = projectNextQueuedWindow(all, '2026-09-01', 8, hoursPerPfBySprintId);
    const expectedAnchor = projectDeveloperAvailabilityDate(all, '2026-09-01', 8)!;
    const expectedWindow = computeTimeline(16, expectedAnchor, 4, 8).impl;
    expect(result).toEqual({ activityKey: 'Q', window: expectedWindow });
  });
});
```

Also extend the existing `describe('projectDeveloperAvailabilityDate', ...)` block:

```ts
test('excludes notStarted activities from the pending sum, even if one somehow carries implEstimatedHours', () => {
  const queued = activity({ notStarted: true, implDone: false, implEstimatedHours: 999, implLoggedHours: 0 });
  expect(projectDeveloperAvailabilityDate([queued], '2026-09-01', 8)).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace client -- TimelineView`
Expected: FAIL — `projectNextQueuedWindow` not defined; the new
`projectDeveloperAvailabilityDate` test fails if notStarted activities
aren't excluded yet (should already pass today coincidentally since
`implEstimatedHours`/`implLoggedHours` are only ever null for notStarted
activities in production — write it anyway to lock the behavior down
explicitly, see Step 3).

- [ ] **Step 3: Implement `projectNextQueuedWindow`, and make `projectDeveloperAvailabilityDate`'s `pending` filter explicitly exclude `notStarted` activities**

In `projectDeveloperAvailabilityDate`, change the `pending` filter from
`activities.filter((a) => !(a.implDone || a.isDone))` to also exclude
`a.notStarted` (`!(a.implDone || a.isDone) && !a.notStarted`).

`projectNextQueuedWindow`: call `resolveNextQueuedActivity(activities)`; if
`null` or `next.storyPoints === null`, return `null`. Call
`projectDeveloperAvailabilityDate(activities, today, hoursPerDay)`; if
`null` (dev fully available), return `null`. Look up
`hoursPerPfBySprintId[next.sprintId]`; call
`computeTimeline(next.storyPoints, anchor, hoursPerPf, hoursPerDay)` and
return `{ activityKey: next.key, window: timeline.impl }`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace client -- TimelineView`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/components/TimelineView.tsx client/src/components/TimelineView.test.ts
git commit -m "feat: add projectNextQueuedWindow projection"
```

---

## Task 4: Client — render the projected bar and update the availability label

**Files:**
- Modify: `client/src/components/BoardScreen.tsx` (pass `hoursPerPfBySprintId` prop to `<TimelineView>`, `~line 230-243`)
- Modify: `client/src/components/TimelineView.tsx` (prop type/destructure; new `nextQueuedWindowByDeveloper` memo; render loop; `computeDomain` call; `ActivityRow` prop + branch; new `ProjectedQueueBar` component; label rename)

**Interfaces:**
- Consumes: `projectNextQueuedWindow`, `resolveNextQueuedActivity` (Task 3), `hoursPerPfBySprintId` (already computed in `BoardScreen.tsx:62-64`), `TimelineWindow` (existing type).
- Produces: visible UI change only — no new exported function for other tasks to consume.

This task is rendering/wiring, following the codebase's existing convention
of not unit-testing JSX in this file (`TimelineView.test.ts` only covers the
exported pure functions) — verify via the full test suite (no regressions)
and a live check against the running panel, per this repo's usual workflow.

- [ ] **Step 1: In `client/src/components/BoardScreen.tsx`, pass `hoursPerPfBySprintId={hoursPerPfBySprintId}` as a new prop on the `<TimelineView>` element (`~line 230-243`)**

- [ ] **Step 2: In `client/src/components/TimelineView.tsx`, add `hoursPerPfBySprintId: Record<string, number>` to the component's prop type and destructure, and add `import { computeTimeline } from '../compute/timeline.js';` if not already present from Task 3**

- [ ] **Step 3: Add a `nextQueuedWindowByDeveloper` memo, computed next to `byDeveloperAcrossAllSprints` (`~line 206`)**

```ts
const nextQueuedWindowByDeveloper = useMemo(() => {
  const map = new Map<string, { activityKey: string; window: TimelineWindow }>();
  for (const [developer, items] of byDeveloperAcrossAllSprints) {
    const available = isDeveloperAvailable(items);
    if (!shouldShowAvailabilityDate(developer, available)) continue;
    const result = projectNextQueuedWindow(items, today, hoursPerDay, hoursPerPfBySprintId);
    if (result) map.set(developer, result);
  }
  return map;
}, [byDeveloperAcrossAllSprints, today, hoursPerDay, hoursPerPfBySprintId]);
```

- [ ] **Step 4: Extend the `computeDomain` call (`~line 165-168`) so the projected window's end date stretches the visible day axis**

Add `[...nextQueuedWindowByDeveloper.values()].map((w) => w.window.end)` to
the `extraDates` array passed into `computeDomain`, alongside the existing
`deadlineRulers.map((r) => r.date)`, and add `nextQueuedWindowByDeveloper` to
that `useMemo`'s dependency array.

- [ ] **Step 5: In the `grouped.map` render loop (`~line 583-642`), look up the developer's queued projection and use it for the label; pass the matching window down to the one `ActivityRow` it belongs to**

```ts
const queued = nextQueuedWindowByDeveloper.get(developer) ?? null;
const availabilityDate = shouldShowAvailabilityDate(developer, available)
  ? (queued ? queued.window.end : projectDeveloperAvailabilityDate(developerActivities, today, hoursPerDay))
  : null;
```

In the `items.map((activity) => ...)` call, add a new prop:
`projectedImplWindow={queued && queued.activityKey === activity.key ? queued.window : null}`.

- [ ] **Step 6: Rename the displayed label text at `~line 619` from "Disponível a partir de" to "Projeção de disponibilidade em"**

- [ ] **Step 7: Add `projectedImplWindow: TimelineWindow | null` to `ActivityRow`'s props (type + destructure, `~line 734-757`)**

- [ ] **Step 8: Add a new `ProjectedQueueBar` component near `PhaseBar` (`~line 1300`)**

```tsx
function ProjectedQueueBar({ boxLeft, boxRight, boxTitle }: { boxLeft: number; boxRight: number; boxTitle: string }) {
  const boxWidth = Math.max(boxRight - boxLeft, 6);
  return (
    <div
      title={boxTitle}
      style={{
        position: 'absolute', left: boxLeft, width: boxWidth, top: 9, height: 16,
        border: '1.5px dashed var(--series-impl)', borderRadius: 4, boxSizing: 'border-box',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: 'var(--series-impl)' }}>PROJEÇÃO</span>
    </div>
  );
}
```

- [ ] **Step 9: In `ActivityRow`'s render branch (`~line 1040`, the `hasBothWindows ? (...) : activity.notStarted ? (<span>ainda não iniciada</span>) : (...)` chain), add a case before the plain "ainda não iniciada" text**

```tsx
) : activity.notStarted && projectedImplWindow ? (
  <ProjectedQueueBar
    boxLeft={x(projectedImplWindow.start)}
    boxRight={x(projectedImplWindow.end)}
    boxTitle={`Projeção (ainda não iniciada): ${formatShort(projectedImplWindow.start)} a ${formatShort(projectedImplWindow.end)}`}
  />
) : activity.notStarted ? (
```

- [ ] **Step 10: Run the full test suite to confirm no regressions**

Run: `npm test`
Expected: PASS (all client + server tests)

- [ ] **Step 11: Verify against live data**

Start the dev server if not already running (`npm run dev`), open the
Linha do tempo, find a developer with one Impl.-in-progress activity and one
"Ainda não iniciada" activity with `storyPoints` set (e.g. Guilherme Henrique
Gibim de Mello / COM-68467 + COM-68465 from the original screenshot, if
still in that state), and confirm: the dashed "PROJEÇÃO" bar appears on the
not-started row, positioned right after the in-progress activity's projected
end; the header now reads "Projeção de disponibilidade em <date>"; the date
shown is later than it would be from the in-progress activity alone.

- [ ] **Step 12: Commit**

```bash
git add client/src/components/BoardScreen.tsx client/src/components/TimelineView.tsx
git commit -m "feat: render projected bar for the next queued activity per developer"
```
