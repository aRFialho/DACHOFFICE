import { officeRepresentativeAssets } from "../assets/manifest.js";
import {
  createOfficeNavigationGrid,
  type OfficeNavigationGrid,
} from "./navigation-grid.js";
import {
  resolveOfficeNavigationRoute,
  type OfficeNavigationRoute,
} from "./navigation-route.js";
import {
  parseOfficeTiledMap,
  type OfficeRendererDestination,
} from "./tiled-map.js";
import {
  createOfficeSceneLayerPlan,
  type OfficeSceneLayerPlanEntry,
} from "./scene-layers.js";

export interface OfficeSceneModel {
  readonly assetIds: readonly string[];
  readonly destinations: readonly OfficeRendererDestination[];
  readonly layers: readonly OfficeSceneLayerPlanEntry[];
  readonly navigationGrid: OfficeNavigationGrid;
  readonly navigationRoute: OfficeNavigationRoute | undefined;
}

export const createOfficeSceneModel = (
  mapSource: unknown,
): OfficeSceneModel => {
  const map = parseOfficeTiledMap(mapSource);
  const navigationGrid = createOfficeNavigationGrid({
    constraints: map.navigationConstraints,
    height: map.navigationSize.height,
    tileSize: map.tileSize,
    width: map.navigationSize.width,
  });
  const navigationRoute = resolveOfficeNavigationRoute({
    destinationId: map.destinations[0]?.id ?? "",
    destinations: map.destinations,
    grid: navigationGrid,
    start: { column: 0, row: 0 },
  });

  return {
    assetIds: officeRepresentativeAssets.map((asset) => asset.id),
    destinations: map.destinations,
    layers: createOfficeSceneLayerPlan(),
    navigationGrid,
    navigationRoute,
  };
};
