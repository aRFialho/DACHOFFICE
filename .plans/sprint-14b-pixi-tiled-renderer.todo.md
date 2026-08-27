# Sprint 14B — PixiJS/Tiled Renderer

## Summary

Implement the first real, non-authoritative Office renderer: a PixiJS v8 canvas that consumes a local Tiled JSON map, keeps geometry inside renderer modules, and produces the layer order defined by Sprint 14A. React remains the accessible control surface; the canvas contains no API, database, marketplace, credential, policy or authorization path.

## Type

Feature.

## Source task and complete requirement coverage

| # | Requirement | Plan step |
| -: | --- | --- |
| 1 | Use PixiJS v8 for the isometric Office, rather than a background screenshot | 2, 5 |
| 2 | Use Tiled for map layers, zones, collisions and semantic destinations | 1, 3 |
| 3 | Preserve React for accessible SaaS/control UI | 5, 6 |
| 4 | Scene uses backend-style semantic state only; it is never the source of truth | 1, 4, 7 |
| 5 | No Pixi access to Neon, ERP, marketplaces or credentials | 4, 7 |
| 6 | Implement independent layers, furniture/assets, zones and debug overlay | 2–6 |
| 7 | Keep pixel coordinates out of application/business contracts | 1, 3, 7 |
| 8 | Test first, validate browser and document acceptance | 1, 6–8 |

**Coverage check:** 8 of 8 requirements mapped.

## Current and desired state

Sprint 14A provides visual tokens, ordered layers, typed logical assets, semantic zones/destinations, a React design-system preview and independent Finance source art. There is no Pixi dependency, map loader, map file or renderer yet.

After this sprint, `apps/web` will contain a focused `office/renderer` boundary: a strict Tiled map parser, scene-layer container builder, depth-sort utility, asset registry and React-owned `OfficeCanvas` lifecycle. A local map is only a visual fixture. Live snapshot/SSE hydration, navigation and agent animation remain later sprints.

## Repository and AGENTS.md compliance

- Strict TypeScript; no `any` or unvalidated `unknown`.
- Reuse `officeSceneLayers`, `officeAssetCatalog`, `officeZones` and `officeDestinations` from `office/art`.
- React owns controls; Pixi owns scene only; Tiled owns pixels/geometry.
- No `office.ts` god module: parser, depth, registry, scene and React bridge remain separate.
- No target-reference image import or static-scene background.
- No network/provider/database calls from renderer modules.

No relevant `CLAUDE.md` is present in the root or affected paths.

## Types

### Reused

- `OfficeSceneLayerId` — Sprint 14A visual layer ids.
- `OfficeAssetDefinition` and `OfficeAtlasDefinition` — logical asset/atlas identities.
- `OfficeZoneId`, `OfficeDestinationId` — backend-safe semantic references.

### New

- `TiledMapDocument`, `TiledLayer`, `TiledObject`, `TiledProperty` — validated subset of Tiled JSON.
- `OfficeMapDefinition` — renderer-owned physical geometry plus semantic object properties.
- `DepthSortable` — sprite/container with renderer-only foot baseline.
- `OfficeScene` — owns Pixi containers and cleanup, not business data.
- `OfficeCanvasProps` — React bridge with local map and optional debug presentation only.

## Impact analysis

### Modify

- `apps/web/package.json` and lockfile — add `pixi.js` v8.
- `apps/web/src/App.tsx`, `apps/web/src/styles.css` — mount a labelled, supplementary canvas preview.
- `apps/web/test/office-art-contract.test.ts` — retain boundary checks; add renderer tests in dedicated files.
- `docs/sprints/14b-pixi-tiled-renderer.md` — implementation/acceptance evidence.

### Create

- `apps/web/src/office/maps/office-prototype.tiled.json` — source-authored local map fixture.
- `apps/web/src/office/renderer/tiled-map.ts` — parser/validator and semantic extraction.
- `apps/web/src/office/renderer/depth-sort.ts` — stable logical foot-baseline sort.
- `apps/web/src/office/renderer/asset-registry.ts` — maps only approved asset ids to textures.
- `apps/web/src/office/renderer/office-scene.ts` — Pixi layer containers, map rendering and cleanup.
- `apps/web/src/office/components/OfficeCanvas.tsx` — React lifecycle/accessibility bridge.
- focused Vitest files for parser, depth sort and asset registry.

### Delete

None. The 14A preview remains a non-operational art reference until the canvas replaces only its representative module.

## Implementation steps

1. Write failing unit tests for the accepted Tiled subset: required layer/object properties, semantic destination resolution, rejection of malformed input and a stable depth sort.
2. Add `pixi.js` v8 and create explicit renderer-only types and utilities. No API client may be imported below `office/renderer`.
3. Add the compact Tiled JSON prototype with floors, walls, furniture, collision, zone and destination object layers. Keep all coordinates local to the map file/renderer.
4. Build parser, map-to-layer container mapping and stable depth sorting; cover it with Vitest before scene creation.
5. Build `OfficeScene` with exactly the 14A layer order, texture registration from the asset manifest, nearest-neighbour scale mode, explicit destroy/resize lifecycle and optional debug overlays.
6. Mount `OfficeCanvas` from React with semantic non-live copy and fallback/error presentation; preserve keyboard/reduced-motion behaviour and never fabricate agent activity.
7. Add boundary tests that renderer modules import no API/database/provider paths and tests that local map coordinates cannot appear in semantic-layout contracts.
8. Run focused tests, typecheck, lint, format, build, full test suite and Playwright desktop/mobile checks. Review diff, record screenshots/evidence and commit/push.

## Removal specification

No old renderer exists. Replace only the static Finance module in `App.tsx` once `OfficeCanvas` is available; remove its direct runtime image import at the same time so there is one representative scene entry point. Do not retain a hidden second scene, migration path or fallback renderer.

## Anti-patterns

- No whole-office image, target-reference import or canvas screenshot background.
- No business-state coordinates, Neon/query code, marketplace code or credentials in renderer files.
- No fake task/agent states, optimistic operational activity or synthetic SSE.
- No broad `office.ts`; no unsafe `any`/unchecked JSON casts.
- No incremental compatibility layer between preview and renderer after replacement.

## Validation criteria

### Before implementation

- [x] Sprint 14A Art Bible, existing source and AGENTS.md reviewed.
- [x] Existing types and affected files audited.
- [x] Worktree created from validated 14A commit.

### After implementation

- [ ] PixiJS v8 installed and used only through renderer modules.
- [ ] Tiled fixture has required visual, collision and semantic layers.
- [ ] Parser/depth/registry tests are written first and pass.
- [ ] Canvas respects 14A layer order and cleans up Pixi resources.
- [ ] React has an accessible supplementary canvas shell.
- [ ] Renderer has no API/provider/database import path.
- [ ] Typecheck, lint, formatter, build, full tests and browser checks pass.
- [ ] Diff and acceptance documentation reviewed.

## Commit sequence

1. `test(web): define tiled renderer contracts`
2. `feat(web): add pixi tiled scene foundation`
3. `feat(web): mount office canvas preview`
4. `docs: record sprint 14b acceptance`
