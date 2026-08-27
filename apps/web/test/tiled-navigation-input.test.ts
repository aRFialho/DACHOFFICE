import { describe, expect, it } from "vitest";
import { parseOfficeTiledMap } from "../src/office/renderer/tiled-map.js";

describe("parseOfficeTiledMap navigation input", () => {
  it("keeps local collision and navigation-blocker rectangles inside renderer output", () => {
    const map = parseOfficeTiledMap({
      height: 3,
      layers: [
        {
          name: "collision",
          objects: [{ height: 32, width: 64, x: 64, y: 0 }],
          type: "objectgroup",
        },
        {
          name: "navigation_blockers",
          objects: [{ height: 32, width: 64, x: 128, y: 32 }],
          type: "objectgroup",
        },
        {
          name: "destinations",
          objects: [
            {
              properties: [
                {
                  name: "destinationId",
                  type: "string",
                  value: "FINANCE_DESK_ARTHUR",
                },
                { name: "officeZone", type: "string", value: "FINANCE" },
                { name: "walkable", type: "bool", value: true },
              ],
              x: 192,
              y: 64,
            },
          ],
          type: "objectgroup",
        },
      ],
      tileheight: 32,
      tilewidth: 64,
      type: "map",
      width: 4,
    });

    expect(map).toMatchObject({
      navigationConstraints: [
        { position: { x: 64, y: 0 }, size: { height: 32, width: 64 } },
        { position: { x: 128, y: 32 }, size: { height: 32, width: 64 } },
      ],
      navigationSize: { height: 3, width: 4 },
    });
  });
});
