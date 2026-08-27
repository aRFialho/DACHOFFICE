# Sprint 15B - Agent Animation and Atlas Loader

## Scope

Sprint 15B adds a renderer-local Finance analyst atlas loader and deterministic animation-state frame selector. The current canvas renders an explicit local `IDLE` reference frame; it does not claim live agent work, navigation, task state or external activity.

## Boundaries

- Atlas rectangles, texture loading and frame selection remain in `office/renderer`.
- The 14A approved frame vocabulary is the only accepted source for frame names.
- React/control/API/worker modules receive no frame coordinates or animation state.
- Movement and authoritative semantic state remain deferred to later frontend slices.

## Evidence

- Tests cover idle, walk and activity selection plus complete unique atlas metadata.
- Pixi renders the `idle_se` frame from the Finance analyst source atlas.
- Frontend tests, typecheck and production build pass.
