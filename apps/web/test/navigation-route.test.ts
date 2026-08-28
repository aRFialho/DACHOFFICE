import { describe, expect, it } from "vitest";
import { resolveOfficeNavigationRoute } from "../src/office/renderer/navigation-route.js";
import { createOfficeNavigationGrid } from "../src/office/renderer/navigation-grid.js";

describe("resolveOfficeNavigationRoute", () => {
  it("resolves a semantic renderer destination without exposing its local position to callers", () => {
    const route = resolveOfficeNavigationRoute({
      destinationId: "FINANCE_DESK_ARTHUR",
      destinations: [
        {
          id: "FINANCE_DESK_ARTHUR",
          position: { x: 192, y: 64 },
          walkable: true,
          zoneId: "FINANCE",
        },
      ],
      grid: createOfficeNavigationGrid({
        constraints: [],
        height: 4,
        tileSize: { height: 32, width: 64 },
        width: 4,
      }),
      start: { column: 0, row: 0 },
    });

    expect(route?.destinationId).toBe("FINANCE_DESK_ARTHUR");
    expect(route?.cells.at(-1)).toEqual({ column: 3, row: 2 });
  });

  it("returns undefined for a non-walkable or unknown destination", () => {
    const grid = createOfficeNavigationGrid({
      constraints: [],
      height: 2,
      tileSize: { height: 32, width: 64 },
      width: 2,
    });

    expect(
      resolveOfficeNavigationRoute({
        destinationId: "UNKNOWN",
        destinations: [],
        grid,
        start: { column: 0, row: 0 },
      }),
    ).toBeUndefined();
  });
});
