# Sprint 15A - Tiled A* Navigation

## Summary

Add a renderer-local navigation foundation that derives a walkable grid from Tiled map dimensions and local blocker geometry, resolves local destinations, and plans a deterministic A* route. The route is visual-only evidence for the Pixi scene; it does not animate agents yet, create business state, or expose pixel or tile coordinates to React/API contracts.

## Type

Feature

## Source Task

Approved frontend programme from the Office handoff: 15A - A* navigation over Tiled semantics.

## Original Requirements (100% Coverage Required)

| # | Requirement | Plan step(s) |
| --- | --- | --- |
| 1 | Continue the approved frontend programme after 14C. | 1-7 |
| 2 | Implement A* navigation over Tiled semantics. | 2-5 |
| 3 | Keep geometry and coordinates renderer-local. | 2-6 |
| 4 | Keep React/control data free from physical navigation coordinates. | 5-6 |
| 5 | Do not invent live agent, task, approval or chat activity. | 5-6 |
| 6 | Preserve focused modules, strict TypeScript and test-first workflow. | 1-7 |
| 7 | Keep the canvas supplementary and accessible. | 5-7 |

**Coverage check:** 7 of 7 requirements mapped to implementation steps.

## Status

Completed

## Context

The existing Pixi/Tiled renderer already parses semantic destinations and the source fixture declares `collision` and `navigation_blockers` layers. They are not yet consumed as navigation constraints. Sprint 15A provides only local path planning. Sprint 15B will animate agents over the planned route and Sprint 15D will hydrate real semantic state.

## Current State

- `tiled-map.ts` exposes local destination positions but no map bounds, blockers or grid.
- `office-prototype.tiled.json` has an 8 x 6 map and empty blocker layers.
- `OfficeScene` draws a static local avatar and optional destination debug labels.
- React panels are explicitly disconnected and must remain independent of visual positions.

## Desired State

- Tiled parser yields renderer-only dimensions, collision rectangles and navigation-blocker rectangles.
- A focused navigation-grid module converts those local constraints into deterministic cardinal walkability.
- A focused A* module returns a shortest valid route or an explicit no-route result.
- A scene-local navigation model resolves a semantic destination and supplies an optional route overlay for the local fixture.
- No application-facing type gains position, tile or path fields.

## AGENTS.md Requirements

### Architecture

- TypeScript strict mode and focused files; no `office.ts`/navigation god object.
- Tiled owns geometry, zones and destinations; Pixi owns visual composition.
- React remains the readable control plane; canvas is supplementary.

### Truth and safety boundaries

- The scene is never a backend source of truth.
- Do not add API, worker, database, Neon, provider, `fetch` or `EventSource` access.
- Do not create task/approval/chat/agent activity data or external action controls.
- Semantic application contracts keep destination identifiers only, never local geometry.

### Type requirements

- No `any`; use `unknown` only at the existing validated Tiled document boundary.
- Local coordinate types remain in `apps/web/src/office/renderer/`.

## Existing Types

### Types to reuse

- `OfficeRendererDestination` from `renderer/tiled-map.ts` - renderer-local semantic destination with local position.
- `OfficeTiledMap` from `renderer/tiled-map.ts` - parser output extended only with local navigation input.
- `OfficeSceneModel` from `renderer/office-scene-model.ts` - composition root for renderer-only map output.
- `OfficeDestinationId` from `art/semantic-layout.ts` - coordinate-free application semantic identifier; tests continue to protect it.

### Types to create

- `OfficeNavigationCell` - local integral grid cell.
- `OfficeNavigationGrid` - dimensions and blocked-cell lookup.
- `OfficeNavigationRoute` - immutable route result with local cells only.
- `OfficeNavigationConstraint` - local object rectangle parsed from blocker layers.

## Impact Analysis

### Files to modify

- `apps/web/src/office/maps/office-prototype.tiled.json` - add local blocker fixture objects required for a nontrivial route.
- `apps/web/src/office/renderer/tiled-map.ts` - parse map width/height and named local blocker layers.
- `apps/web/src/office/renderer/office-scene-model.ts` - compose the renderer-local navigation result.
- `apps/web/src/office/renderer/office-scene.ts` - draw an optional local route overlay only; no movement state machine.
- `apps/web/test/tiled-map.test.ts` and `apps/web/test/office-scene-model.test.ts` - cover expanded local map/model contract.

### Files to create

- `apps/web/src/office/renderer/navigation-grid.ts` - grid construction and safe local-cell operations.
- `apps/web/src/office/renderer/a-star-path.ts` - deterministic cardinal A* search.
- `apps/web/src/office/renderer/navigation-route.ts` - resolve a semantic renderer destination into a local visual route.
- `apps/web/test/navigation-grid.test.ts` - blocker projection and boundary cases.
- `apps/web/test/a-star-path.test.ts` - shortest route, no-route and deterministic tie behavior.
- `apps/web/test/navigation-route.test.ts` - semantic destination resolution remains renderer-local.
- `docs/sprints/15a-tiled-navigation.md` - scope, boundary and acceptance evidence.

### Files to delete

- None. The static avatar stays as a 14B source reference; route overlay supplements it until 15B animation.

### Dependencies and breaking changes

- No package changes.
- No React, API, worker or database contract changes.
- The parser grows local renderer fields only; application semantic contracts stay unchanged.

## Implementation Steps

### Step 1: Write and observe failing navigation tests

**Files:** `apps/web/test/navigation-grid.test.ts`, `apps/web/test/a-star-path.test.ts`, `apps/web/test/navigation-route.test.ts`, relevant existing map/model tests.

**Action:** Define desired shortest-cardinal-route, blocker, blocked-endpoint, no-route and semantic-destination behavior before production modules. Run the targeted suite and verify failures are due to absent navigation behavior.

### Step 2: Parse local navigation input from Tiled

**Files:** `apps/web/src/office/renderer/tiled-map.ts`, `apps/web/src/office/maps/office-prototype.tiled.json`, `apps/web/test/tiled-map.test.ts`.

**Action:** Validate finite map dimensions and extract local rectangles from `collision` and `navigation_blockers` object layers. Keep those values inside renderer interfaces and reject malformed geometry.

### Step 3: Build a focused navigation grid

**Files:** `apps/web/src/office/renderer/navigation-grid.ts`, `apps/web/test/navigation-grid.test.ts`.

**Action:** Convert local blocker rectangles into blocked grid cells, expose bounds/walkability/neighbours and prevent diagonal corner-cutting by using cardinal movement only.

### Step 4: Implement deterministic A* search

**Files:** `apps/web/src/office/renderer/a-star-path.ts`, `apps/web/test/a-star-path.test.ts`.

**Action:** Use Manhattan heuristic and stable neighbor ordering to return an immutable shortest route or `undefined` when no route exists. Do not embed Tiled parsing or Pixi drawing here.

### Step 5: Resolve visual routes and render local evidence

**Files:** `apps/web/src/office/renderer/navigation-route.ts`, `apps/web/src/office/renderer/office-scene-model.ts`, `apps/web/src/office/renderer/office-scene.ts`, corresponding tests.

**Action:** Translate a renderer-local start and semantic destination into a local route, then draw a non-operational diagnostic route when debug is enabled. The static avatar must not acquire fake work or movement state.

### Step 6: Protect boundaries and accessibility

**Files:** existing renderer/control boundary tests and `apps/web/test/office-art-contract.test.ts` if needed.

**Action:** Confirm renderer source still has no API/provider/transport concern and semantic art contracts still contain no local coordinates. Keep a textual React explanation that the preview is disconnected.

### Step 7: Validate and document

**Files:** `docs/sprints/15a-tiled-navigation.md`, `.plans/sprint-15a-tiled-navigation.todo.md`.

**Action:** Run targeted and full workspace validation, desktop/390 px Playwright review, review diff, record acceptance evidence, commit and publish the branch.

## REMOVAL SPECIFICATION

### From `apps/web/src/office/renderer/office-scene.ts`

- Do not leave any inline route-search logic in the Pixi scene.
  - **Why:** scene composition must not become a navigation god object.
  - **Replacement:** `navigation-grid.ts`, `a-star-path.ts` and `navigation-route.ts` from Steps 3-5.

### Removal checklist

- [x] No path search or grid construction remains inline in `OfficeScene`.
- [x] No navigation coordinates are exported from `art/` or `control/` modules.
- [x] No obsolete direct static route data remains after the model composition is updated.

## Anti-patterns to Avoid

- Do not implement navigation in React, API or worker code.
- Do not let semantic destination IDs carry x/y coordinates outside renderer modules.
- Do not add diagonal movement, physics simulation, agent animation or business action execution in 15A.
- Do not infer a live agent path from disconnected placeholder data.
- Do not use the target image as map geometry or a background.

## Validation Criteria

### Pre-implementation

- [x] Relevant handoff/sprint documents, repository instructions and renderer code reviewed.
- [x] Existing map, parser, model and tests inspected.
- [x] Isolated worktree created from the published 14C branch.
- [x] Build and full baseline tests passed.

### Post-implementation

- [x] Failing navigation tests observed before production implementation.
- [x] Tiled blocker constraints and map dimensions are validated locally.
- [x] A* returns deterministic shortest cardinal routes and explicit no-route results.
- [x] Visual route resolution accepts semantic destination IDs only at its public renderer boundary.
- [x] No local geometry reaches React/control/API/worker contracts.
- [x] Targeted tests, full build/tests/typecheck/lint/format and diff check pass.
- [x] Desktop and 390 px browser review is clean.
- [x] Documentation, plan and commit/push evidence are updated.
