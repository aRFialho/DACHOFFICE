import { describe, expect, it } from "vitest";
import { officeSceneLayers } from "../src/office/art/index.js";
import { createOfficeSceneLayerPlan } from "../src/office/renderer/scene-layers.js";

describe("createOfficeSceneLayerPlan", () => {
  it("uses the approved art layer order without introducing renderer-only layers", () => {
    expect(createOfficeSceneLayerPlan()).toEqual(
      officeSceneLayers.map(({ id, order }) => ({ id, order })),
    );
  });
});
