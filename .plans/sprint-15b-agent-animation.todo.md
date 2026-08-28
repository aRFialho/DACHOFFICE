# Sprint 15B - Agent Animation and Atlas Loader

## Summary

Add a focused renderer-local agent animation state machine and atlas metadata loader for the approved Finance analyst source image. The implementation is a non-operational local preview until Sprint 15D supplies authoritative semantic state.

## Status

Completed and pending integration choice.

## Requirements Coverage

| Requirement | Steps |
| --- | --- |
| Implement the approved 15B atlas loader and animation state machine. | 1-4 |
| Reuse the 14A atlas frame vocabulary. | 1-3 |
| Keep animation, frame rectangles and local time inside the renderer. | 2-5 |
| Do not imply live tasks, actions, conversations or authorization. | 2-6 |
| Preserve strict TypeScript, tests, accessibility and visual validation. | 1-7 |

## Current State

- 14A defines the Finance analyst atlas vocabulary and 14B renders a static local avatar reference.
- 15A supplies local navigation routes but does not move agents.
- React remains disconnected and must not own atlas coordinates or frame state.

## Plan

1. Write red tests for deterministic approved-frame selection and atlas metadata coverage.
2. Add focused `agent-animation-state.ts` and `agent-atlas.ts` renderer modules.
3. Load the atlas source as Pixi textures and render a static `IDLE` preview frame.
4. Keep the preview label and disconnected React explanation explicit; no semantic backend state is consumed.
5. Add boundary tests preventing transport/API/database concerns in animation modules.
6. Run targeted and full validation, then Playwright desktop/mobile review.
7. Update docs/plan, review diff, commit and push.

## Files

- Create `apps/web/src/office/renderer/agent-animation-state.ts`.
- Create `apps/web/src/office/renderer/agent-atlas.ts`.
- Modify `apps/web/src/office/renderer/office-scene.ts`.
- Create focused tests under `apps/web/test/`.
- Create `docs/sprints/15b-agent-animation.md`.

## Boundaries

- Atlas frames, local time and texture rectangles stay below the renderer boundary.
- React/API/worker/control contracts gain no coordinates, frame names or animation state.
- The preview is `IDLE` by construction, not a claim about a real agent.
- Movement along routes remains outside this scope unless authoritative state later requests it.

## Acceptance Checklist

- [x] Tests failed before production modules existed, then passed.
- [x] Required 14A atlas frame vocabulary is covered exactly once by metadata.
- [x] Local animation state maps deterministically to approved atlas frames.
- [x] Pixi uses the atlas loader for the Finance preview.
- [x] Renderer boundary remains free of transport/API/database/provider concerns.
- [x] Build, tests, typecheck, lint, format and diff checks pass.
- [x] Desktop and 390 px browser reviews are clean.
- [x] Commit and GitHub branch update selected by the user.
