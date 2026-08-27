import { describe, expect, it } from "vitest";
import { parseOfficeTiledMap } from "../src/office/renderer/tiled-map.js";

const validMap = {
  type: "map",
  tilewidth: 64,
  tileheight: 32,
  width: 3,
  height: 2,
  layers: [
    { name: "floor", type: "tilelayer" },
    { name: "walls_back", type: "tilelayer" },
    { name: "furniture_back", type: "tilelayer" },
    { name: "collision", type: "objectgroup", objects: [] },
    {
      name: "room_zones",
      type: "objectgroup",
      objects: [
        {
          id: 1,
          name: "FINANCE",
          x: 64,
          y: 32,
          width: 128,
          height: 64,
          properties: [
            { name: "officeZone", type: "string", value: "FINANCE" },
          ],
        },
      ],
    },
    {
      name: "destinations",
      type: "objectgroup",
      objects: [
        {
          id: 2,
          name: "FINANCE_DESK_ARTHUR",
          x: 96,
          y: 48,
          width: 32,
          height: 16,
          properties: [
            {
              name: "destinationId",
              type: "string",
              value: "FINANCE_DESK_ARTHUR",
            },
            { name: "officeZone", type: "string", value: "FINANCE" },
            { name: "walkable", type: "bool", value: true },
          ],
        },
      ],
    },
  ],
};

describe("parseOfficeTiledMap", () => {
  it("keeps map coordinates inside renderer-owned destinations", () => {
    const map = parseOfficeTiledMap(validMap);

    expect(map.tileSize).toEqual({ width: 64, height: 32 });
    expect(map.destinations).toEqual([
      expect.objectContaining({
        id: "FINANCE_DESK_ARTHUR",
        zoneId: "FINANCE",
        position: { x: 96, y: 48 },
      }),
    ]);
  });

  it("rejects destinations without their required semantic properties", () => {
    const malformedMap = structuredClone(validMap);
    malformedMap.layers[5] = {
      name: "destinations",
      type: "objectgroup",
      objects: [{ id: 2, name: "missing-properties", x: 0, y: 0 }],
    };

    expect(() => parseOfficeTiledMap(malformedMap)).toThrow(
      /destinationId.*officeZone.*walkable/i,
    );
  });
});
