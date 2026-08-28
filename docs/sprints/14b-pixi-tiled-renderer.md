# Sprint 14B — PixiJS/Tiled Renderer

## Purpose

Sprint 14B replaces the static Finance-only prototype module with a real PixiJS v8 canvas. The canvas is a local visual fixture: it consumes the Tiled source map, retains geometry within renderer modules and never becomes a business or authorization source of truth.

## Renderer boundary

```text
React App / OfficeCanvas
  -> local office-prototype.tiled.json
  -> parseOfficeTiledMap + OfficeSceneModel
  -> Pixi OfficeScene
  -> approved layers + local asset registry
```

React owns the labelled, accessible shell and status text. Pixi owns only visual composition. `tiled-map.ts` owns validation of the accepted Tiled subset, while `scene-layers.ts`, `asset-registry.ts`, `office-scene-model.ts` and `office-scene.ts` each have one focused responsibility.

No renderer module imports API, worker, database, Neon, provider, marketplace, `fetch` or `EventSource` code. A focused boundary test enforces this.

## Tiled source fixture

`apps/web/src/office/maps/office-prototype.tiled.json` uses the approved 64 × 32 tile dimensions and carries visual/physical coordinates locally. It provides the visual layers plus collision, navigation blockers, workstations, room zones, destinations, entrances, meeting seats, display anchors and branding anchors.

`destinationId`, `officeZone` and `walkable` are required semantic properties for destination objects. The parser exposes their local pixel positions only as renderer-owned data; `office/art/semantic-layout.ts` remains coordinate-free.

## Scene composition

The scene creates exactly the Sprint 14A layer sequence, then renders a small Finance-room fixture from independent elements: isometric floor diamonds, room tint, back/front wall shapes, the Finance workstation asset and a static local avatar reference. The avatar is not an agent activity feed and conveys no live state.

Representative source textures are loaded with Pixi nearest-neighbour sampling. Pixi resources are destroyed when React unmounts, but cached `Assets` textures are retained; this prevents React Strict Mode remounts from reusing a destroyed texture source.

## Accessibility

`OfficeCanvas` provides a labelled `role="img"` host, a permanent text description that no live operational state is shown, and a polite lifecycle status. The React shell remains usable without the canvas.

## Explicit non-goals

- no snapshot/SSE/provider/database connection;
- no task, approval, chat or authorization action;
- no navigation or agent animation state machine;
- no target-reference image used as a scene/background;
- no Tiled coordinate in application or backend contracts.

Those concerns remain for 14C and 15A–15E.

## Acceptance evidence

- `pixi.js` v8.20.0 is installed in the web workspace.
- Parser, depth sorter, layer plan, asset registry, scene model, canvas accessibility, App mount and renderer-boundary tests pass.
- `corepack pnpm build`, `corepack pnpm test`, `corepack pnpm lint`, `corepack pnpm format:check` and `git diff --check` pass.
- Playwright desktop and 390 × 844 mobile checks confirmed the labelled canvas and responsive document structure. Console was clean after the Strict Mode asset lifecycle correction.
