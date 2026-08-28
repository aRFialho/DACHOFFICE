import { describe, expect, it } from "vitest";
import officePrototypeMap from "../src/office/maps/office-prototype.tiled.json";
import { createOfficeSceneModel } from "../src/office/renderer/office-scene-model.js";

describe("createOfficeSceneModel", () => {
  it("combines the local Tiled map, approved layers and explicit representative assets", () => {
    const scene = createOfficeSceneModel(officePrototypeMap);

    expect(scene.layers.map((layer) => layer.id)).toEqual([
      "floor",
      "floor_decals",
      "walls_back",
      "furniture_back",
      "dynamic",
      "furniture_front",
      "walls_front",
      "effects",
      "overlays",
      "debug",
    ]);
    expect(scene.destinations[0]).toEqual(
      expect.objectContaining({ id: "FINANCE_DESK_ARTHUR" }),
    );
    expect(scene.assetIds).toEqual([
      "furniture.analyst_desk",
      "agent.finance_analyst",
    ]);
  });
});
