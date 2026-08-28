import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import officePrototypeMap from "../src/office/maps/office-prototype.tiled.json";
import { defaultOfficeVisualScenarioId } from "../src/office/renderer/office-visual-scenario.js";
import { createOfficeSceneModel } from "../src/office/renderer/office-scene-model.js";

const officeSceneSource = readFileSync(
  resolve(import.meta.dirname, "../src/office/renderer/office-scene.ts"),
  "utf8",
);

describe("Office fixture composition", () => {
  it("keeps the default visual state a local Daily Meeting fixture", () => {
    expect(defaultOfficeVisualScenarioId).toBe("DAILY_MEETING");
    expect(officeSceneSource).toContain("drawFixtureAgents");
  });

  it("uses renderer-owned map destinations for the War Room fixture", () => {
    const model = createOfficeSceneModel(officePrototypeMap);

    expect(model.destinations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "WAR_ROOM_SEAT_01", zoneId: "WAR_ROOM" }),
      ]),
    );
  });
});
