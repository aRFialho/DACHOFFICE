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
  it("defines semantic destinations for local meeting, incident and workforce fixtures", () => {
    const map = parseOfficeTiledMap(officePrototypeMap);

    expect(map.destinations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "MEETING_MAIN_SEAT_01",
          zoneId: "MEETING",
        }),
        expect.objectContaining({ id: "WAR_ROOM_SEAT_01", zoneId: "WAR_ROOM" }),
        expect.objectContaining({ id: "REFRESH_COFFEE_01", zoneId: "REFRESH" }),
        expect.objectContaining({ id: "OFF_DUTY_EXIT_01", zoneId: "ENTRANCE" }),
      ]),
    );
  });
});
