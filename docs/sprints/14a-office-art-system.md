# Sprint 14A - Office Art Bible and Asset System

## Purpose

Sprint 14A establishes the visual grammar for DACHBYTE OFFICE before PixiJS and Tiled implementation. The approved visual reference is versioned at `docs/visual-references/dachbyte-office-target-reference.png` for review only. It is not a web asset and must never be rendered as a scene background.

## Visual principles

The Office is a warm, layered isometric workplace inside a calm dark control plane. It should feel inhabited and operationally legible, but no visual motion may imply a backend action that has not occurred. React owns accessible controls and PixiJS will own the scene in Sprint 14B.

### Projection and scale

- Use a 2:1 isometric diamond grid.
- Base logical tile: 64 x 32 px.
- Standard wall height: 48 px from the tile baseline.
- Agent foot baseline: 24 px from a 64 x 80 representative frame.
- Pixel assets use nearest-neighbour scaling only; do not mix arbitrary high-resolution art with the pixel grid.

### Layer order

| Order | Id                | Responsibility                                              |
| ----: | ----------------- | ----------------------------------------------------------- |
|    00 | `floor`           | base room tiles                                             |
|    10 | `floor_decals`    | markings and entrance branding                              |
|    20 | `walls_back`      | rear walls and glass                                        |
|    30 | `furniture_back`  | furniture behind people                                     |
|    40 | `dynamic`         | agents and dynamic objects, sorted by logical foot position |
|    50 | `furniture_front` | foreground furniture                                        |
|    60 | `walls_front`     | foreground wall detail                                      |
|    70 | `effects`         | non-authoritative local glow/ambient effects                |
|    80 | `overlays`        | status and speech summaries                                 |
|    90 | `debug`           | development-only diagnostics                                |

## Palette and lighting

| Token group        | Intent                                       |
| ------------------ | -------------------------------------------- |
| Canvas / surface   | midnight blue control plane, not flat black  |
| System cyan        | live-system affordances and focus treatments |
| Attention amber    | human attention and review affordances       |
| Critical rose      | critical state only, always paired with text |
| Finance teal       | finance room identity                        |
| Performance coral  | performance/ads room identity                |
| Operations blue    | operations room identity                     |
| Marketplace orange | marketplace room identity                    |
| Executive violet   | executive and meeting identity               |
| Refresh green      | respite/refresh room identity                |

Lighting is local: furniture can carry local shade, while room tints and overlays provide atmosphere. No globally baked lighting may prevent a department tint change. Agent silhouettes must remain readable in every room.

## Independent asset catalogue

The typed catalogue in `apps/web/src/office/art/asset-contract.ts` is the source for logical asset ids. It intentionally separates floors, walls, furniture, rooms, agents, effects, branding and scene UI. A map composes these records; it never receives one full-office image.

Asset file naming after Sprint 14A:

```text
<category>.<purpose>.<variant>.png
atlas.agent.<role>.v<version>.json
```

Examples: `floor.office_base.default.png`, `furniture.analyst_desk.default.png`, `atlas.agent.finance_analyst.v1.json`.

## Representative source art

`furniture/finance-analyst-desk-v1.png` and `agents/finance-analyst-atlas-v1.png` are separate representative source assets. The latter provides eight orientation references (idle and walk) for one Finance analyst; it is not a whole-office image and has no encoded business state. Sprint 14B will normalize source textures and register their runtime atlas metadata before Pixi renders them. Neither asset assigns a coordinate, destination or operational meaning.

## Atlas contract

Every animated agent atlas includes:

```text
idle_ne, idle_nw, idle_se, idle_sw
walk_ne_01, walk_nw_01, walk_se_01, walk_sw_01
work_computer, analyze, talk, meeting, alert, refresh
```

Frame metadata is versioned with frame dimensions, source asset id and named frame rectangles. Sprint 14A only defines the contract; generation and Pixi atlas loading are Sprint 14B/15B work.

## Tiled contract for Sprint 14B

Tiled owns geometry and physical placement. Required layers are floor, floor decals, back walls, front walls/decor, furniture, collision, navigation blockers, workstations, room zones, destinations, entrances, meeting seats, display anchors and branding anchors.

Required object properties:

```text
officeZone
objectType
destinationId
walkable
interactionType
depthClass
```

Backend and application contracts use destination identifiers such as `FINANCE_DESK_ARTHUR` and `MEETING_MAIN_SEAT_01`; they never carry map pixels or tile coordinates.

## Accessibility and motion

- The canvas is supplementary; each meaningful state/action has a React equivalent.
- Every focusable element uses a visible high-contrast focus ring.
- Motion obeys `prefers-reduced-motion`.
- Status is conveyed through text/icon/semantic control in addition to color.
- Speech overlays contain short safe summaries; complete conversations remain in React history.

## Future frontend sequence

1. **14B**: PixiJS v8 scene, Tiled loader, depth sorter, asset registry and debug overlay.
2. **14C**: control-plane shell, task/approval/chat panels and canvas integration.
3. **15A**: A\* navigation over Tiled semantics.
4. **15B**: agent animation state machine and atlas loader.
5. **15C**: meetings, War Room, refresh, off-duty and speech behavior.
6. **15D**: snapshot/SSE hydration, cursors and reconnect recovery.
7. **15E**: visual comparison, Playwright screenshots and performance acceptance.

No channel/provider integration is resumed by this frontend programme.

## Acceptance evidence

- Target reference is stored exclusively in documentation.
- Typed layer, asset, atlas and semantic destination contracts exist with focused tests.
- The React Art System preview is explicitly non-operational and makes no API, database or provider call.
- Playwright review at desktop and 390 px mobile confirmed the accessible preview, with no browser console errors or warnings.
