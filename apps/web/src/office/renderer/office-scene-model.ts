import { officeRepresentativeAssets } from "../assets/manifest.js";
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
}

export const createOfficeSceneModel = (
  mapSource: unknown,
): OfficeSceneModel => {
  const map = parseOfficeTiledMap(mapSource);

  return {
    assetIds: officeRepresentativeAssets.map((asset) => asset.id),
    destinations: map.destinations,
    layers: createOfficeSceneLayerPlan(),
  };
};
