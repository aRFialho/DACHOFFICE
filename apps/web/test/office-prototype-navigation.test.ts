import { describe, expect, it } from "vitest";
import officePrototypeMap from "../src/office/maps/office-prototype.tiled.json";
import { parseOfficeTiledMap } from "../src/office/renderer/tiled-map.js";

describe("Office prototype navigation fixture", () => {
  it("contains a local navigation blocker while preserving a route to Finance", () => {
    const map = parseOfficeTiledMap(officePrototypeMap);

    expect(map.navigationConstraints).toEqual([
      {
        position: { x: 64, y: 0 },
        size: { height: 32, width: 64 },
      },
    ]);
  });
});
