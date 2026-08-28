import { officeSceneLayers } from "../art/index.js";

export interface OfficeSceneLayerPlanEntry {
  readonly id: (typeof officeSceneLayers)[number]["id"];
  readonly order: number;
}

export const createOfficeSceneLayerPlan =
  (): readonly OfficeSceneLayerPlanEntry[] =>
    officeSceneLayers.map(({ id, order }) => ({ id, order }));
