# Sprint 14C — React Office Control Shell

## Summary

Replace the art-system preview as the primary application surface with an accessible React control-plane shell around the existing local Pixi/Tiled canvas. The shell is intentionally disconnected until Sprint 15D, so it must represent empty authoritative states rather than fabricate tasks, approvals, conversations, agent activity, or integration data.

## Type

Feature

## Source Task

User-approved full frontend programme; approved handoff frontend sequence, step 14C: control-plane shell, task/approval/chat panels and canvas integration.

## Original Requirements (100% Coverage Required)

| # | Requirement | Plan step(s) |
| --- | --- | --- |
| 1 | Continue implementation of the approved frontend programme. | 1–6 |
| 2 | Build the 14C control-plane shell. | 2, 4 |
| 3 | Include task, approval and chat React panels. | 2, 4 |
| 4 | Integrate the existing Pixi/Tiled Office canvas. | 4 |
| 5 | Canvas stays supplementary and business state is not derived from pixels. | 2–5 |
| 6 | No false operational state before snapshot/SSE hydration in 15D. | 2–5 |
| 7 | Preserve frontend accessibility and reduced-motion behavior. | 4–6 |
| 8 | Use focused TypeScript modules and tests before behavior. | 1–6 |

**Coverage check:** 8 of 8 requirements mapped to implementation steps.

## Status

Completed

## Context

Sprint 14B provides a local Pixi v8/Tiled prototype renderer mounted by `OfficeCanvas`. The handoff places React in charge of task, approval, chat and control UI, while the scene remains a visual projection. Snapshot/SSE is intentionally deferred to Sprint 15D; therefore 14C can establish the composition and contract surface, but cannot claim live business activity.

## Current State

- `App.tsx` presents the Sprint 14A art catalogue alongside the 14B local renderer.
- `OfficeCanvas` exposes an accessible, local non-live renderer with lifecycle ownership isolated in React.
- No frontend task, approval or conversation projection exists.
- Renderer modules are already protected from API, worker, database, provider and transport concerns.

## Desired State

- The primary page is a focused control-plane shell with the Office canvas and a React-readable operations rail.
- Task, approval and chat panels each carry explicit empty authoritative states while disconnected.
- A small typed model defines the future projection shape without fetching, EventSource, credentials or business-rule ownership.
- Tests prove the disconnected state and frontend boundary; the existing renderer remains mounted through React.

## AGENTS.md Requirements

### Naming and architecture

- Use strict TypeScript and focused modules under `apps/web/src/office/control/`.
- React owns the shell; Pixi/Tiled remain isolated in their existing renderer/component modules.
- Do not create `office.ts` or another god object.

### Safety and truth boundaries

- The backend is the eventual system of record; this shell is not an authority.
- Do not use LLM output, external credentials, direct database calls or provider calls.
- Do not present estimated or operational results as real.
- Do not turn the target reference into runtime art.

### Accessibility

- Keep the canvas supplementary with React equivalents for meaningful status.
- Keep high-contrast focus treatment and reduced-motion support.

## Existing Types

### Types to reuse

- `OfficeCanvasProps` from `apps/web/src/office/components/OfficeCanvas.tsx` — the canvas remains a focused scene bridge.

### Types to create

- `OfficeControlConnection` — current transport status and explicit human-readable detail.
- `OfficeTaskSummary`, `OfficeApprovalSummary`, `OfficeConversationSummary` — minimal read models for the later authoritative projection.
- `OfficeControlModel` — composed React input model; it owns no source-of-truth behavior.

### Type guidelines

- No `any` or `unknown`.
- Use readonly arrays and discriminated literal states where appropriate.
- Do not add pixel coordinates, access tokens or execution controls to the model.

## Impact Analysis

### Files to modify

- `apps/web/src/App.tsx` — replace the art-catalogue-first composition with the 14C shell.
- `apps/web/src/styles.css` — add intentional responsive control-plane layout and remove the now-unused catalogue page rules.
- `apps/web/test/app-office-renderer.test.tsx` — assert application composition through the control shell.

### Files to create

- `apps/web/src/office/control/office-control-model.ts` — disconnected model and future projection interface.
- `apps/web/src/office/control/OfficeControlPanel.tsx` — reusable, non-interactive read panel.
- `apps/web/src/office/control/OfficeControlShell.tsx` — canvas and React panel composition.
- `apps/web/test/office-control-model.test.ts` — prove the empty disconnected source model.
- `apps/web/test/office-control-shell.test.tsx` — prove visible React equivalents and non-live state.
- `apps/web/test/control-boundary.test.ts` — prevent transport/API/database/provider imports in control modules.
- `docs/sprints/14c-react-office-shell.md` — document scope, contract and acceptance evidence.

### Files to delete

- None. The art system remains documented and contracted; only unused runtime composition and CSS are removed from the primary page.

### Dependencies and breaking changes

- No new package is required.
- Existing `OfficeCanvas` public props and renderer lifecycle remain unchanged.
- The primary browser copy changes from an art preview to a control shell, with no API contract change.

## Implementation Steps

### Step 1: Define the plan and red tests

**Files:** `.plans/sprint-14c-react-office-shell.todo.md`, `apps/web/test/office-control-model.test.ts`, `apps/web/test/office-control-shell.test.tsx`, `apps/web/test/control-boundary.test.ts`, `apps/web/test/app-office-renderer.test.tsx`

**Action:** Write tests first for a disconnected model with empty collections, screen-reader-visible empty panels, canvas composition, and the no-live-transport control boundary. Run them and record the expected failure because 14C modules do not exist.

### Step 2: Add a typed disconnected projection model

**File:** `apps/web/src/office/control/office-control-model.ts`

**Action:** Add readonly display-only interfaces and `disconnectedOfficeControlModel`. State exactly that snapshot/SSE is not connected. Collections must be empty.

### Step 3: Add a focused React panel primitive

**File:** `apps/web/src/office/control/OfficeControlPanel.tsx`

**Action:** Render an accessible labelled region with a status and explicit empty message. Do not add action buttons, mutations or fake list items.

### Step 4: Compose the Office control shell

**Files:** `apps/web/src/office/control/OfficeControlShell.tsx`, `apps/web/src/App.tsx`

**Action:** Mount the existing `OfficeCanvas` as the visual scene and place status, task, approval and chat React panels around it. Replace the retired art-catalogue-first runtime page while preserving its source contracts.

### Step 5: Apply responsive, distinctive control-plane styling

**File:** `apps/web/src/styles.css`

**Action:** Create a readable midnight control deck with cyan system status, outlined information rail, mobile stacking, visible focus and reduced-motion support. Keep CSS effects decorative and avoid screenshot/background reconstruction.

### Step 6: Validate and document

**Files:** `docs/sprints/14c-react-office-shell.md`, `.plans/sprint-14c-react-office-shell.todo.md`

**Action:** Run targeted tests, workspace typecheck/build/test/lint/format checks, then a desktop and 390 px Playwright review. Review the diff, record exact evidence and update checkboxes.

## REMOVAL SPECIFICATION

### From `apps/web/src/App.tsx`

- Remove direct composition of the 14A art overview, layer catalogue, asset catalogue and zone list.
  - **Why:** these are reference material, not the primary 14C operational control surface.
  - **Replacement:** `OfficeControlShell` in Step 4.
  - **Dependencies:** the art contracts remain imported by tests and are not removed.

### From `apps/web/src/styles.css`

- Remove page-specific rules used only by the retired art-catalogue-first composition.
  - **Why:** avoid dead CSS and two competing primary layouts.
  - **Replacement:** control-shell styling in Step 5.

### Removal checklist

- [x] Direct `OfficeCanvas` composition removed from `App.tsx`.
- [x] Retired catalogue-only imports removed from `App.tsx`.
- [x] Retired page CSS removed.
- [x] No obsolete art-preview-only text remains on the primary route.

## Anti-patterns to Avoid

- Do not invent task cards, approvals, users, timestamps, messages or activity to make the UI look live.
- Do not fetch directly from the control UI, connect `EventSource`, import API/worker/database/provider code, or expose credentials.
- Do not make the Pixi canvas a source of truth or use its tile coordinates in the model.
- Do not add mutating control buttons before the actual policy-authorized backend action path exists.
- Do not use a screenshot as a UI background.

## Validation Criteria

### Pre-implementation

- [x] Root and relevant sprint documentation reviewed.
- [x] Existing React, renderer and test patterns inspected.
- [x] No additional `CLAUDE.md` applies.
- [x] Isolated worktree verified.

### Post-implementation

- [x] Red tests observed before production implementation.
- [x] Task, approval and chat panels expose explicit disconnected empty states.
- [x] Canvas is integrated through `OfficeCanvas` and remains supplementary.
- [x] Control modules contain no API, worker, database, provider, `fetch` or `EventSource` access.
- [x] Typecheck, build, tests, lint and format check pass.
- [x] Desktop and 390 px browser review pass without console errors/warnings.
- [x] Diff reviewed; documentation and plan evidence updated.
