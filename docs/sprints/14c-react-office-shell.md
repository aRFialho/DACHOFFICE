# Sprint 14C - React Office Control Shell

## Status

Completed

## Scope

Sprint 14C turns the primary web surface into a React control plane around the existing local PixiJS/Tiled Office renderer. React owns the readable task, approval and chat panels; the canvas remains supplementary and is never a business source of truth.

Snapshot/SSE hydration is deliberately deferred to Sprint 15D. Until then this interface renders an explicit `DISCONNECTED` projection state and empty authoritative collections. It does not fabricate tasks, approvals, conversations, agents, timestamps or integration activity.

## Implementation

- `office-control-model.ts` defines strict readonly display contracts for a future authoritative projection and its disconnected local model.
- `OfficeControlPanel.tsx` renders a focused accessible empty-state panel with no mutating controls.
- `OfficeControlShell.tsx` composes the status surface, Pixi/Tiled canvas, and React task, approval and chat equivalents.
- `App.tsx` now mounts the shell instead of the art-catalogue-first preview. The art contracts remain retained and tested.
- `styles.css` provides a responsive control deck, visible focus styling and reduced-motion support without using the target image as runtime art.

## Boundaries

- No direct API, worker, database, Neon, marketplace, `fetch` or `EventSource` access exists in `src/office/control`.
- No credential, authorization, policy or external-write behavior is present in the frontend shell.
- The scene receives no business coordinates and cannot create authoritative operational state.
- The status rail says `DISCONNECTED` until the snapshot/SSE integration slice supplies a real projection.

## Acceptance Evidence

- Test-first contracts were observed red before production modules existed, then passed after implementation.
- `apps/web/test/office-control-model.test.ts` verifies the disconnected model has no operational records.
- `apps/web/test/office-control-shell.test.tsx` verifies React-readable task, approval, chat and canvas composition.
- `apps/web/test/control-boundary.test.ts` prevents backend/provider/database/live-transport concerns in control modules.
- Desktop and 390 px Playwright accessibility snapshots showed the shell, canvas and all empty panels in order; browser console had zero errors and zero warnings (apart from React DevTools informational output).
- Workspace validation after building workspace artifacts passed: 244 tests in the reported suites, typecheck, build, lint, Prettier and `git diff --check`.

## Deferred Work

- 15A: navigation over Tiled semantics.
- 15B: agent animation state and atlas loading.
- 15C: meetings, War Room, refresh/off-duty and speech behavior.
- 15D: authoritative snapshot/SSE hydration, cursors and reconnect recovery.
- 15E: visual comparison and performance acceptance.
