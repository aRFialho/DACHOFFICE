# Sprint 15C - Meetings, War Room, and Workforce Fixture Behavior

## Scope

Sprint 15C adds deterministic renderer-local fixtures for Daily Meeting, critical War Room, Refresh, and Off-duty behavior. These scenarios are presentation fixtures only: they do not represent live meetings, incidents, workforce state, tasks, approvals, actions, or external activity.

## Delivered

- `office-visual-scenario.ts` defines immutable semantic scenarios with renderer display IDs, start/target destinations, approved 14A animation states, and optional fixture speech.
- The Tiled prototype owns the Meeting, War Room, Refresh, and Entrance zones plus semantic seat, coffee, and exit destinations.
- `fixture-agent-route.ts` resolves only map-owned destination IDs through the existing A\* grid and projects routes into Pixi positions.
- `OfficeScene` creates local fixture sprites in the dynamic layer, uses `WALKING` during ticker-driven travel, then changes to the configured final frame on arrival.
- `speech-bubble.ts` creates overlay-only local bubbles. The critical fixture's text is fixed local copy and carries no task or incident identifier.
- React continues to label the canvas as disconnected local fixture output. A development-only `officeFixture` query accepts known fixture IDs for browser review; production does not read it and offers no scenario control.

## Scenario Contract

| Scenario            | Final state  | Target destinations        | Presentation rule                                                                     |
| ------------------- | ------------ | -------------------------- | ------------------------------------------------------------------------------------- |
| `DAILY_MEETING`     | `MEETING`    | `MEETING_MAIN_SEAT_01..03` | Three configured local participants gather at map-owned seats.                        |
| `WAR_ROOM_CRITICAL` | `ALERT`      | `WAR_ROOM_SEAT_01..03`     | Three local participants route to War Room; one critical local bubble is displayed.   |
| `REFRESH`           | `REFRESHING` | `REFRESH_COFFEE_01..02`    | Two local participants gather at Refresh destinations.                                |
| `OFF_DUTY`          | `IDLE`       | `OFF_DUTY_EXIT_01`         | One local participant travels to the exit; 14A has no dedicated off-duty atlas frame. |

## Safety and Ownership Boundaries

- Tiled/renderer owns geometry, destinations, routing, sprite frames, ticker time, and speech positioning.
- React owns the accessible explanation only; it receives no scene coordinates, frame names, live data, or operational commands.
- The renderer boundary test continues to reject API, worker, database, Neon, provider, `fetch`, and `EventSource` concerns.
- Sprite arrival is presentation-only and cannot create a request, command, task, event, approval, or external write.
- Sprint 15D will replace fixture selection with authoritative snapshot/SSE adaptation while retaining a renderer-only visual model.

## Acceptance Evidence

- Test-first coverage validates the four scenario contracts, semantic Tiled destinations, route endpoints/clamping/unknown-destination rejection, speech-bubble construction, renderer boundaries, default composition, and accessible fixture copy.
- Playwright loaded `DAILY_MEETING`, `WAR_ROOM_CRITICAL`, `REFRESH`, and `OFF_DUTY` at desktop size, and `DAILY_MEETING` at 390 px. Each run exposed the accessible local-fixture copy and reported zero console errors and warnings; the only console message was React DevTools information.
- The final validation commands are recorded in the Sprint plan and run against the final tree before publication.

## Deferred to Sprint 15D

- Runtime snapshot request and hydration.
- SSE subscription, sequence/cursor tracking, stale-event protection, reconnect, and gap recovery.
- Any authoritative mapping from persisted meetings, incidents, agents, or workforce state to the visual model.
