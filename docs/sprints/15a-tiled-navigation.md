# Sprint 15A - Tiled A\* Navigation

## Status

Completed

## Scope

Sprint 15A adds deterministic cardinal A\* navigation inside the Office renderer. Tiled map dimensions, collision objects and navigation blockers are parsed as renderer-local geometry; semantic destinations resolve to local route cells only after crossing into the renderer.

## Modules

- `navigation-grid.ts` projects local blocker rectangles onto a bounded walkable grid.
- `a-star-path.ts` returns the shortest cardinal route with stable neighbour ordering, or `undefined` for no route.
- `navigation-route.ts` resolves renderer destinations without adding coordinates to application contracts.
- `navigation-route-overlay.ts` projects local route cells into isometric points for a debug-only Pixi overlay.

## Boundaries

- React, API, worker, database and provider code receive no map coordinates or paths.
- The route overlay is diagnostic only; the local avatar remains static. Agent movement and animation are deferred to 15B.
- The Office remains disconnected from snapshot/SSE operational state until 15D.

## Acceptance Evidence

- Test-first contracts cover blockers, cardinal neighbours, shortest routes, deterministic detours, blocked targets, semantic resolution and isometric projection.
- The Tiled prototype includes one local navigation blocker while retaining a route to Finance.
- Targeted frontend validation passed with 19 files and 30 tests, plus typecheck.

## Deferred Work

- 15B: agent animation and movement along these renderer-local routes.
- 15C: meeting, War Room and speech behavior.
- 15D: snapshot/SSE hydration and reconnect recovery.
- 15E: performance and visual comparison acceptance.
