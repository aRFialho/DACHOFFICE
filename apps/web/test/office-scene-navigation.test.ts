import { describe, expect, it } from "vitest";
import officePrototypeMap from "../src/office/maps/office-prototype.tiled.json";
import { createOfficeSceneModel } from "../src/office/renderer/office-scene-model.js";

describe("OfficeSceneModel navigation", () => {
  it("keeps its local visual route in the renderer composition", () => {
    const scene = createOfficeSceneModel(officePrototypeMap);

    expect(scene).toMatchObject({
      navigationRoute: {
        destinationId: "FINANCE_DESK_ARTHUR",
      },
    });
  });
});
