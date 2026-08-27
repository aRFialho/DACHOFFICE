# Sprint 15C Meetings, War Room, and Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render local, deterministic Daily Meeting, War Room, Refresh, and Off-duty scenarios in Pixi while keeping business state authoritative in the future 15D adapter.

**Architecture:** Immutable fixtures describe display IDs, source and target semantic destinations, final atlas state, and optional presentation speech. Focused renderer modules resolve Tiled destinations, project A\* routes, and move only Pixi sprites with the ticker. React remains an accessible local-preview shell and never receives map coordinates, frame names, or operational controls.

**Tech Stack:** React 19, TypeScript strict mode, PixiJS v8, Tiled JSON, Vitest, Playwright CLI, pnpm.

**Spec:** `docs/superpowers/specs/2026-08-27-sprint-15c-meetings-war-room-design.md`

## Global Constraints

- Read `AGENTS.md`, the spec, and Sprints 15A/15B documents before implementation.
- Coordinates, routes, ticker updates, sprites, and speech layout stay in `apps/web/src/office/renderer` or the Tiled map.
- Renderer modules must not import API, worker, database, Neon, providers, `fetch`, or `EventSource`.
- Fixtures are local/non-operational and cannot execute or imply a business action.
- Use only the approved 14A atlas vocabulary and nearest-neighbour scaling.
- Do not add dependencies or change backend, worker, database, policy, credential, integration, or write paths.
- Final commands are `corepack pnpm build`, `corepack pnpm test`, `corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm format:check`, `git diff --check`, and `git diff --cached --check`.

---

### Task 1: Semantic fixture scenarios and Tiled destinations

**Files:**

- Create: `apps/web/src/office/renderer/office-visual-scenario.ts`
- Create: `apps/web/test/office-visual-scenario.test.ts`
- Modify: `apps/web/src/office/maps/office-prototype.tiled.json`
- Modify: `apps/web/test/office-prototype-navigation.test.ts`
- Modify: `apps/web/test/tiled-map.test.ts`

**Interfaces:**

- Consumes: `AgentAnimationSelection` and `OfficeRendererDestination`.
- Produces: `OfficeVisualScenarioId`, `OfficeVisualAgentFixture`, `OfficeVisualScenario`, and `resolveOfficeVisualScenario(id)`.
- Produces map IDs `MEETING_MAIN_SEAT_01..03`, `WAR_ROOM_SEAT_01..03`, `REFRESH_COFFEE_01..02`, and `OFF_DUTY_EXIT_01`.

- [ ] **Step 1: Write failing fixture tests**

```ts
expect(resolveOfficeVisualScenario("DAILY_MEETING").agents).toEqual(
  expect.arrayContaining([
    expect.objectContaining({
      destinationId: "MEETING_MAIN_SEAT_01",
      animation: expect.objectContaining({ state: "MEETING" }),
    }),
  ]),
);

expect(resolveOfficeVisualScenario("WAR_ROOM_CRITICAL").agents).toEqual(
  expect.arrayContaining([
    expect.objectContaining({
      animation: expect.objectContaining({ state: "ALERT" }),
      speech: expect.objectContaining({ severity: "CRITICAL" }),
    }),
  ]),
);
```

- [ ] **Step 2: Verify the intended red state**

Run: `corepack pnpm --filter @dachbyte-office/web test -- office-visual-scenario.test.ts`

Expected: FAIL because `office-visual-scenario.ts` is not present.

- [ ] **Step 3: Implement immutable scenarios**

```ts
export interface OfficeVisualAgentFixture {
  readonly agentId: string;
  readonly animation: AgentAnimationSelection;
  readonly destinationId: string;
  readonly startDestinationId: string;
  readonly speech?: Readonly<{
    severity: "NORMAL" | "CRITICAL";
    text: string;
  }>;
}

export const resolveOfficeVisualScenario = (
  id: OfficeVisualScenarioId,
): OfficeVisualScenario => scenarios[id];
```

Create four fixtures: Daily Meeting has three `MEETING` participants; War Room has three `ALERT` participants and one critical bubble; Refresh has two `REFRESHING` participants; Off-duty has one `IDLE` participant traveling to the exit.

- [ ] **Step 4: Add semantic Tiled zones and destinations**

Add `MEETING`, `WAR_ROOM`, `REFRESH`, and `ENTRANCE` zones plus all required destination objects to the `destinations` layer. Each object must provide `destinationId`, `officeZone`, and boolean `walkable: true`; coordinates stay in the map and visible Office composition.

- [ ] **Step 5: Extend map parser fixture tests**

```ts
expect(map.destinations.map((destination) => destination.id)).toEqual(
  expect.arrayContaining([
    "MEETING_MAIN_SEAT_01",
    "WAR_ROOM_SEAT_01",
    "REFRESH_COFFEE_01",
    "OFF_DUTY_EXIT_01",
  ]),
);
```

Also prove parsed destination zones include `MEETING`, `WAR_ROOM`, and `REFRESH`.

- [ ] **Step 6: Verify Task 1 and commit**

Run: `corepack pnpm --filter @dachbyte-office/web test -- office-visual-scenario.test.ts office-prototype-navigation.test.ts tiled-map.test.ts`

Run: `corepack pnpm exec prettier --write apps/web/src/office/renderer/office-visual-scenario.ts apps/web/src/office/maps/office-prototype.tiled.json apps/web/test/office-visual-scenario.test.ts apps/web/test/office-prototype-navigation.test.ts apps/web/test/tiled-map.test.ts`

```bash
git add -- apps/web/src/office/renderer/office-visual-scenario.ts apps/web/src/office/maps/office-prototype.tiled.json apps/web/test/office-visual-scenario.test.ts apps/web/test/office-prototype-navigation.test.ts apps/web/test/tiled-map.test.ts
git commit -m "feat(web): add office visual scenarios"
```

### Task 2: Local route playback and speech bubbles

**Files:**

- Create: `apps/web/src/office/renderer/fixture-agent-route.ts`
- Create: `apps/web/src/office/renderer/speech-bubble.ts`
- Create: `apps/web/test/fixture-agent-route.test.ts`
- Create: `apps/web/test/speech-bubble.test.ts`
- Modify: `apps/web/test/renderer-boundary.test.ts`

**Interfaces:**

- Consumes: scenario fixtures, renderer destinations, navigation grid, A\* route projection, and animation types.
- Produces: `createFixtureAgentRoute(input)` and `positionForFixtureRoute(route, progress)`.
- Produces: `createSpeechBubble({ text, severity })` returning a Pixi `Container` labeled `local-fixture-speech-*`.

- [ ] **Step 1: Write failing route and bubble tests**

```ts
const route = createFixtureAgentRoute({
  destinations,
  grid,
  startDestinationId: "FINANCE_DESK_ARTHUR",
  targetDestinationId: "MEETING_MAIN_SEAT_01",
});

expect(route.cells.length).toBeGreaterThan(1);
expect(positionForFixtureRoute(route, 0)).toEqual(route.start);
expect(positionForFixtureRoute(route, 1)).toEqual(route.target);
```

Test progress clamping, a missing semantic destination, and a critical bubble label/palette output.

- [ ] **Step 2: Verify the intended red state**

Run: `corepack pnpm --filter @dachbyte-office/web test -- fixture-agent-route.test.ts speech-bubble.test.ts`

Expected: FAIL because both modules are missing.

- [ ] **Step 3: Implement route projection and interpolation**

```ts
export const positionForFixtureRoute = (
  route: FixtureAgentRoute,
  progress: number,
): Readonly<{ x: number; y: number }> => {
  const bounded = Math.min(1, Math.max(0, progress));
  const index = Math.min(
    route.points.length - 1,
    Math.floor(bounded * (route.points.length - 1)),
  );
  return route.points[index]!;
};
```

Resolve source/target by semantic ID, call existing renderer-owned path planning, and project cells with `projectOfficeNavigationRoute`. Keep the helper free of Pixi, time, and React state.

- [ ] **Step 4: Implement overlay-only bubbles**

```ts
export const createSpeechBubble = ({
  severity,
  text,
}: OfficeSpeechBubble): Container => {
  const bubble = new Container({ label: `local-fixture-speech-${severity}` });
  // Add a Graphics background and readable Pixi Text children.
  return bubble;
};
```

Use `officeArtTokens.palette.critical` for critical emphasis and immutable fixture text. Do not accept task IDs, action IDs, commands, or events.

- [ ] **Step 5: Preserve the renderer boundary and commit**

Extend `renderer-boundary.test.ts` only if the existing directory scan does not already include these files.

Run: `corepack pnpm --filter @dachbyte-office/web test -- fixture-agent-route.test.ts speech-bubble.test.ts renderer-boundary.test.ts`

Run: `corepack pnpm --filter @dachbyte-office/web typecheck`

```bash
git add -- apps/web/src/office/renderer/fixture-agent-route.ts apps/web/src/office/renderer/speech-bubble.ts apps/web/test/fixture-agent-route.test.ts apps/web/test/speech-bubble.test.ts apps/web/test/renderer-boundary.test.ts
git commit -m "feat(web): add local fixture route playback"
```

### Task 3: Compose Pixi scenarios and truthful canvas copy

**Files:**

- Modify: `apps/web/src/office/renderer/office-scene.ts`
- Modify: `apps/web/src/office/components/OfficeCanvas.tsx`
- Modify: `apps/web/test/office-scene-navigation.test.ts`
- Modify: `apps/web/test/office-canvas.test.tsx`
- Create: `apps/web/test/office-fixture-composition.test.ts`

**Interfaces:**

- Consumes: scenario resolution, local routes, bubbles, atlas textures, and frame selection.
- Produces: `OfficeSceneOptions.scenarioId?: OfficeVisualScenarioId`; default is `DAILY_MEETING`.
- Preserves: `OfficeCanvasProps` has no live-state, coordinate, or control callback.

- [ ] **Step 1: Write failing composition and accessibility tests**

```ts
expect(createOfficeSceneModel(officePrototypeMap).destinations).toEqual(
  expect.arrayContaining([
    expect.objectContaining({ id: "WAR_ROOM_SEAT_01", zoneId: "WAR_ROOM" }),
  ]),
);

expect(renderToStaticMarkup(<OfficeCanvas />)).toContain(
  "local fixture scenarios",
);
```

Add a source-level contract test that the default is local `DAILY_MEETING`, never a live backend state.

- [ ] **Step 2: Verify the intended red state**

Run: `corepack pnpm --filter @dachbyte-office/web test -- office-fixture-composition.test.ts office-canvas.test.tsx office-scene-navigation.test.ts`

Expected: FAIL until scenario composition exists.

- [ ] **Step 3: Render fixture agents using Pixi ticker playback**

```ts
private async drawFixtureAgents(
  dynamicLayer: Container,
  overlayLayer: Container,
  model: OfficeSceneModel,
  scenarioId: OfficeVisualScenarioId,
  registry: OfficeAssetRegistry,
): Promise<void> {
  const scenario = resolveOfficeVisualScenario(scenarioId);
  // Load one atlas, create fixture sprites, and advance local routes only.
}
```

Use `dynamic` for sprites and `overlays` for bubbles. Show `WALKING` before arrival and the fixture final state after arrival. Route completion must not create a command, event, task, or request.

- [ ] **Step 4: Make preview copy explicit**

Update `OfficeCanvas` to say it renders local fixture scenarios with no live meeting, incident, workforce, task, or action data. Do not add a visible selector or operational control.

- [ ] **Step 5: Verify Task 3 and visual states**

Run: `corepack pnpm --filter @dachbyte-office/web test`

Run: `corepack pnpm --filter @dachbyte-office/web build`

Use Playwright for desktop and 390 px Daily Meeting screenshots. Mount each remaining fixture through test-only scene options and inspect speech placement, critical emphasis, Refresh grouping, Off-duty exit placement, and console output.

- [ ] **Step 6: Commit Task 3**

```bash
git add -- apps/web/src/office/renderer/office-scene.ts apps/web/src/office/components/OfficeCanvas.tsx apps/web/test/office-scene-navigation.test.ts apps/web/test/office-canvas.test.tsx apps/web/test/office-fixture-composition.test.ts
git commit -m "feat(web): render meeting and war room fixtures"
```

### Task 4: Acceptance record, verification, and publication

**Files:**

- Create: `docs/sprints/15c-meetings-war-room.md`
- Modify: `docs/superpowers/plans/2026-08-27-sprint-15c-meetings-war-room.md`

**Interfaces:**

- Consumes: completed scenarios, map destinations, routes, browser screenshots, and test output.
  - Produces: a truthful fixture-only acceptance record and completed plan checklist.

- [ ] **Step 1: Document acceptance evidence**

Record scenario IDs, map destination ownership, final animation states, bubble boundary, browser viewports, and the 15D snapshot/SSE handoff. State plainly that the scenarios are not live operational state.

- [ ] **Step 2: Run fresh full verification**

```bash
corepack pnpm build
corepack pnpm test
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm format:check
git diff --check
git diff --cached --check
```

Expected: all commands exit 0; capture exact web and workspace test counts.

- [ ] **Step 3: Review acceptance and publish**

Confirm Daily participants gather at configured seats, critical fixtures route to War Room, Refresh/Off-duty remain local workforce presentation, bubbles are fixture-only, and no transport/backend dependency exists.

```bash
git add -- docs/sprints/15c-meetings-war-room.md docs/superpowers/plans/2026-08-27-sprint-15c-meetings-war-room.md
git commit -m "docs(web): record 15c visual behavior evidence"
git push -u origin sprint/15c-meetings-war-room
```

## Commit Sequence

1. `docs(web): specify 15c office visual fixtures` (committed).
2. `docs(web): add local fixture travel to 15c design` (committed).
3. `feat(web): add office visual scenarios`.
4. `feat(web): add local fixture route playback`.
5. `feat(web): render meeting and war room fixtures`.
6. `docs(web): record 15c visual behavior evidence`.
