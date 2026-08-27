# Sprint 14A - Office Art Bible and Asset System

## Summary

This Sprint starts the approved frontend program with a reusable art and contract foundation. It freezes the approved target reference in documentation, defines modular isometric assets and semantic visual contracts, and adds an accessible React preview. It does not implement PixiJS, Tiled loading, navigation, SSE, provider access, or any marketplace integration.

## Type

Feature - first implementation slice of the frontend sequence 14A to 15E.

## Source task

User request on 2026-08-27: pause other sprints and begin the complete frontend now. Approved handoff sections 07, 12 and 13 are mandatory sources.

## Original requirements and coverage

| # | Requirement | Plan steps |
|---|---|---|
| 1 | Begin frontend development now | 1-8 |
| 2 | Leave unrelated business and channel sprints on hold | 1, 8 |
| 3 | Use the approved target reference as quality guidance | 1, 2, 7 |
| 4 | Do not ship the screenshot as a background | 1-5, 7 |
| 5 | Build from independent floors, walls, furniture, rooms, agents, effects and UI | 2-6 |
| 6 | Preserve React, PixiJS v8 and Tiled responsibilities | 2, 5, 8 |
| 7 | Keep visual state semantic and backend-authoritative | 3, 4, 6, 8 |
| 8 | Sequence the complete frontend into testable slices | 8 |

Coverage check: 8 of 8 requirements mapped.

## Status

In progress. This branch delivers Sprint 14A only; 14B through 15E remain explicit successor sprints.

## Current and desired state

`apps/web` is a minimal React/Vite shell with no scene, visual tokens, asset manifest, map, renderer, or browser suite. After 14A, it has a documented visual system and typed contracts for independently rendered assets and semantic destinations. The target image lives only under `docs/visual-references/` and is never imported at runtime.

## Repository compliance

- Strict TypeScript and focused modules are required by `AGENTS.md`.
- No relevant `CLAUDE.md` exists.
- React owns accessible control UI; PixiJS owns its future scene; Tiled owns future geometry and physical coordinates.
- The frontend only receives semantic snapshot/SSE state in later sprints and never owns business truth.
- No migration, financial logic, provider call or external write is part of this work.

## Visual direction

- 2:1 isometric projection with a 64 x 32 logical base tile.
- Dense pixel-office world framed by a calm dark control plane.
- Cyan represents system presence, amber represents human attention, and room tints distinguish departments without changing semantic meaning.
- Ordered layers: floor, decals, back walls, furniture-back, dynamic entities, furniture-front, front walls, effects, speech/status and debug.
- All important information has text and semantic UI equivalents; color is never the only signal.

## Types

### Reuse

- React 19, Vite and strict TypeScript in `apps/web`.
- Existing `App.tsx` and `styles.css` as the Foundation placeholder to replace in place.

### Create

- `OfficeArtTokens` for projection, palette, spacing and layer order.
- `OfficeAssetDefinition`, `OfficeAtlasDefinition` and `OfficeAssetCategory` for modular assets.
- `OfficeZoneDefinition` and `OfficeDestinationDefinition` for semantic map vocabulary without coordinates.
- `OfficeAgentVisualState` as the narrow future React-to-Pixi input contract.

No `any`. `unknown` remains limited to future validated map/event parsing boundaries.

## Impact analysis

### Create

- `docs/visual-references/dachbyte-office-target-reference.png`
- `docs/sprints/14a-office-art-system.md`
- `apps/web/src/office/art/tokens.ts`
- `apps/web/src/office/art/asset-contract.ts`
- `apps/web/src/office/art/semantic-layout.ts`
- `apps/web/src/office/art/index.ts`
- `apps/web/test/office-art-contract.test.ts`

### Modify

- `apps/web/src/App.tsx` and `apps/web/src/styles.css` for an accessible non-operational Art System preview.
- `apps/web/package.json` only if the existing test command needs a scoped source test update.
- `README.md` and this plan with completion evidence.

### Remove

Replace the Foundation placeholder copy and its minimal centered styles in place. No file deletion is needed.

## Implementation steps

1. Freeze the target reference under documentation and write an Art Bible: projection, palette, lighting, pixel rules, naming, layer order, atlas rules, Tiled properties and acceptance criteria.
2. Add immutable visual tokens for geometry, depth layers, department tints, status colors, focus and reduced motion guidance.
3. Add independent asset contracts and a first logical catalogue for floors, walls, furniture, rooms, agents, effects, branding and scene UI.
4. Add semantic zones and destinations for entrance, departments, meeting seats, War Room and refresh without physical coordinates.
5. Write failing contract tests for unique asset ids, ordered layers, required animation frames, destination semantics and the absence of runtime target-reference imports.
6. Implement the contracts and replace the Foundation placeholder with an accessible token/catalogue preview that never reports live activity or calls an API.
7. Build, inspect the preview with Playwright, check responsive/focus/reduced-motion behavior, review the diff and update documentation.
8. Continue only after acceptance in separate worktrees: 14B Pixi/Tiled renderer, 14C React Office shell, 15A navigation, 15B animation state machine, 15C meetings/War Room/refresh, 15D snapshot/SSE and 15E visual-performance acceptance.

## Removal specification

- Remove `FOUNDATION / SPRINT 0` from the runtime React shell.
- Remove the Foundation-only full-page centering CSS.
- Verify that a runtime-source search finds neither the Foundation label nor an import of `dachbyte-office-target-reference`.

## Anti-patterns

- Never render the target screenshot as a scene/background.
- Never make a single `office.ts` god module.
- Never give Pixi database, marketplace, credential or authorization responsibility.
- Never put physical coordinates into business or backend contracts.
- Never fake real agent activity in this preview.
- Never add 14B renderer/SSE/provider scope to this branch.

## Validation criteria

### Before implementation

- [x] Handoff sections 07, 12 and 13 read.
- [x] `AGENTS.md` and frontend conventions read; no relevant `CLAUDE.md` exists.
- [x] Existing web shell audited.
- [x] Target reference versioned under documentation only.

### After implementation

- [ ] Asset and semantic-layout contracts have focused tests.
- [ ] Web test, typecheck, lint, build, formatter and diff checks pass.
- [ ] The preview is keyboard accessible, responsive and reduced-motion safe.
- [ ] The runtime has no target-image import or provider/database access.
- [ ] The Art Bible records the 14A acceptance evidence and future sequence.
- [ ] Diff and browser screenshot are reviewed.

## Commit sequence

1. `docs: add office art bible and reference`
2. `test(web): define office art contracts`
3. `feat(web): add office art preview`
4. `docs: record sprint 14a acceptance`