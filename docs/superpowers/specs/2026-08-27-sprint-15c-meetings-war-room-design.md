# Sprint 15C Meetings, War Room, and Refresh Visual Behavior Design

## Goal

Render deterministic local preview scenarios for Daily Meeting, critical War Room, Refresh, and Off-duty behavior, using only semantic destinations resolved by the Tiled map. The preview must exercise the visual behavior required by Sprint 15C without claiming that any backend action, incident, meeting, or workforce state is live.

## Source Material

- `DACHBYTE_OFFICE_COMPLETE_HANDOFF.md`, Sprint 15C and documents 12 and 13 in `DACHBYTE_OFFICE_4_CORE_FILES.zip`.
- `docs/sprints/15a-tiled-navigation.md`.
- `docs/sprints/15b-agent-animation.md`.
- `apps/web/src/office/maps/office-prototype.tiled.json`.

## Constraints

- React remains the accessible control layer; PixiJS v8 renders scene-only presentation.
- Tiled owns all map geometry, room zones, seats, and semantic destination positions.
- The renderer receives no transport, API, database, provider, credential, `fetch`, or `EventSource` concerns.
- Fixtures are explicitly local and non-operational until Sprint 15D hydrates the same visual model from snapshot and SSE state.
- A scene animation must never execute, authorize, or imply an external business action.
- Reuse the approved 14A atlas vocabulary and nearest-neighbour asset scaling.
- Keep modules focused; do not introduce a god `office.ts` or `agent.ts` module.

## Approved Approach

Sprint 15C will add a renderer-local fixture boundary rather than a provisional backend adapter. Each fixture is a semantic `OfficeVisualScenario`: it names agents, renderer animation states, semantic destination IDs, and optional presentation-only speech. The map resolves the destinations; Pixi uses the existing A\* route projection and a renderer-local ticker to move fixture agents to the resulting arrangement. Sprint 15D will replace fixture selection with an event/snapshot adapter while preserving the scene-facing visual-model shape.

## Scenario Model

`apps/web/src/office/renderer/office-visual-scenario.ts` will own only the fixture model and validation.

```ts
export type OfficeVisualScenarioId =
  | "DAILY_MEETING"
  | "WAR_ROOM_CRITICAL"
  | "REFRESH"
  | "OFF_DUTY";

export interface OfficeVisualAgentFixture {
  readonly agentId: string;
  readonly animation: AgentAnimationSelection;
  readonly destinationId: string;
  readonly speech?: Readonly<{
    severity: "NORMAL" | "CRITICAL";
    text: string;
  }>;
}

export interface OfficeVisualScenario {
  readonly id: OfficeVisualScenarioId;
  readonly agents: readonly OfficeVisualAgentFixture[];
  readonly label: string;
}

export const resolveOfficeVisualScenario = (
  id: OfficeVisualScenarioId,
): OfficeVisualScenario => /* named immutable fixture */;
```

The fixture agent IDs are stable display IDs only. They do not identify authenticated users, persisted workers, tasks, meetings, or incidents. The `animation` shape reuses `AgentAnimationSelection` from 15B so every visual state maps through the approved atlas contract.

## Map and Destination Design

`office-prototype.tiled.json` will gain these semantic destinations and zones:

| Scenario      | Zone       | Destinations                                                           |
| ------------- | ---------- | ---------------------------------------------------------------------- |
| Daily Meeting | `MEETING`  | `MEETING_MAIN_SEAT_01`, `MEETING_MAIN_SEAT_02`, `MEETING_MAIN_SEAT_03` |
| War Room      | `WAR_ROOM` | `WAR_ROOM_SEAT_01`, `WAR_ROOM_SEAT_02`, `WAR_ROOM_SEAT_03`             |
| Refresh       | `REFRESH`  | `REFRESH_COFFEE_01`, `REFRESH_COFFEE_02`                               |
| Off-duty      | `ENTRANCE` | `OFF_DUTY_EXIT_01`                                                     |

Every object keeps `destinationId`, `officeZone`, and `walkable` properties. Layout coordinates remain inside the Tiled map and existing renderer parsing/projection; no destination position may enter React, API, worker, or application state contracts.

## Renderer Composition

`OfficeScene` will accept an optional local `scenarioId`, defaulting to `DAILY_MEETING` for the visible local preview. It will:

1. resolve the selected immutable scenario;
2. resolve each fixture destination from the parsed map;
3. resolve a deterministic local route from each fixture start destination to its target destination, then interpolate its sprite with a Pixi ticker while it displays the approved `WALKING` frame;
4. transition the arrived sprite to its scenario animation state;
5. place a short Pixi `Text` speech bubble only when the fixture explicitly contains `speech`;
6. label scene objects as local fixture elements for deterministic renderer tests.

The critical fixture uses `ALERT` frames and a `CRITICAL` bubble. Daily Meeting uses `MEETING`; Refresh uses `REFRESHING`; Off-duty uses `IDLE` at the exit because 14A has no dedicated off-duty frame. This is a presentation convention only, documented in the scenario label. Movement interpolation is renderer-local presentation: it starts and ends only from immutable fixture destinations and never signals a backend completion. 15D remains the only integration slice.

## Accessible React Boundary

`OfficeCanvas` will continue to state that the scene is a local fixture and contains no live operational state. It may pass a fixed local scenario ID to Pixi but will not expose scene coordinates, frame names, untrusted event data, operational controls, or a user action that simulates a business workflow.

## Tests and Acceptance Evidence

- Unit tests prove every scenario contains only known animation states, map destination IDs, and deterministic local movement intents.
- Unit tests prove Daily Meeting has configured seat participants, War Room contains critical participants and speech, and Refresh/Off-duty use their correct workforce-presentation states.
- Tiled-map tests prove the required semantic destinations and zones are parseable.
- Renderer boundary tests keep scenario modules free of live transport/backend concerns.
- Existing scene tests prove the default scenario is assembled through the local renderer composition and routes each configured participant through renderer-owned map geometry.
- Playwright captures the desktop and 390 px local preview. A small fixture-only selector in test harness code, not production control UI, will capture all four named scenario states.
- Full validation is `corepack pnpm build`, then `corepack pnpm test`, `corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm format:check`, and both staged/unstaged `git diff --check` commands.

## Non-goals

- No runtime-snapshot HTTP request, SSE subscription, cursor, reconnect, or stale-event implementation; those belong to 15D.
- No API, database, queue, integration, credential, policy, or external-write changes.
- No claim of live meetings, incidents, refresh periods, off-duty status, or agent collaboration.
- No click-to-command, approval action, or business mutation from the scene.
- No attempt to rebuild the approved target image as a background.

## Migration to Sprint 15D

Sprint 15D will create a distinct snapshot/SSE adapter above the renderer boundary. It will convert authoritative semantic events into the same agent/destination/speech presentation model that this sprint exercises with fixtures. It must not give the renderer direct access to the API, Neon, ERP, or marketplaces.
