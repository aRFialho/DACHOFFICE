import { describe, expect, it } from "vitest";
import officePrototypeMap from "../src/office/maps/office-prototype.tiled.json";
import {
  createFixtureAgentRoute,
  positionForFixtureRoute,
} from "../src/office/renderer/fixture-agent-route.js";
import { createOfficeNavigationGrid } from "../src/office/renderer/navigation-grid.js";
import { parseOfficeTiledMap } from "../src/office/renderer/tiled-map.js";

const map = parseOfficeTiledMap(officePrototypeMap);
const grid = createOfficeNavigationGrid({
  constraints: map.navigationConstraints,
  height: map.navigationSize.height,
  tileSize: map.tileSize,
  width: map.navigationSize.width,
});

const route = createFixtureAgentRoute({
  destinations: map.destinations,
  grid,
  origin: { x: 340, y: 104 },
  startDestinationId: "FINANCE_DESK_ARTHUR",
  targetDestinationId: "MEETING_MAIN_SEAT_01",
  tileSize: map.tileSize,
});

describe("fixture agent routes", () => {
  it("resolves semantic fixture destinations through the renderer navigation grid", () => {
    expect(route.cells.length).toBeGreaterThan(1);
    expect(route.destinationId).toBe("MEETING_MAIN_SEAT_01");
    expect(route.start).toEqual(positionForFixtureRoute(route, 0));
    expect(route.target).toEqual(positionForFixtureRoute(route, 1));
  });

  it("clamps movement progress without returning a hard-coded fallback position", () => {
    expect(positionForFixtureRoute(route, -1)).toEqual(route.start);
    expect(positionForFixtureRoute(route, 2)).toEqual(route.target);
  });

  it("rejects an unknown semantic fixture destination", () => {
    expect(() =>
      createFixtureAgentRoute({
        destinations: map.destinations,
        grid,
        origin: { x: 340, y: 104 },
        startDestinationId: "FINANCE_DESK_ARTHUR",
        targetDestinationId: "UNKNOWN_DESTINATION",
        tileSize: map.tileSize,
      }),
    ).toThrow(/unknown fixture destination/i);
  });
});
