import { describe, expect, it } from "vitest";
import { projectOfficeNavigationRoute } from "../src/office/renderer/navigation-route-overlay.js";

describe("projectOfficeNavigationRoute", () => {
  it("projects renderer-local grid cells onto deterministic isometric points", () => {
    expect(
      projectOfficeNavigationRoute(
        [
          { column: 0, row: 0 },
          { column: 1, row: 0 },
          { column: 1, row: 1 },
        ],
        { x: 340, y: 104 },
        { height: 32, width: 64 },
      ),
    ).toEqual([
      { x: 340, y: 104 },
      { x: 372, y: 120 },
      { x: 340, y: 136 },
    ]);
  });
});
