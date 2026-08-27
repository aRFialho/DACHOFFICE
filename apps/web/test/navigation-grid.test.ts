import { describe, expect, it } from "vitest";
import {
  createOfficeNavigationGrid,
  type OfficeNavigationCell,
} from "../src/office/renderer/navigation-grid.js";

const cell = (column: number, row: number): OfficeNavigationCell => ({
  column,
  row,
});

describe("createOfficeNavigationGrid", () => {
  it("projects local blocker rectangles onto renderer-only grid cells", () => {
    const grid = createOfficeNavigationGrid({
      constraints: [
        {
          position: { x: 64, y: 32 },
          size: { height: 64, width: 128 },
        },
      ],
      height: 4,
      tileSize: { height: 32, width: 64 },
      width: 5,
    });

    expect(grid.isWalkable(cell(1, 1))).toBe(false);
    expect(grid.isWalkable(cell(2, 2))).toBe(false);
    expect(grid.isWalkable(cell(0, 0))).toBe(true);
    expect(grid.isWalkable(cell(5, 0))).toBe(false);
  });

  it("uses a stable cardinal neighbour order without diagonal cells", () => {
    const grid = createOfficeNavigationGrid({
      constraints: [],
      height: 3,
      tileSize: { height: 32, width: 64 },
      width: 3,
    });

    expect(grid.neighbours(cell(1, 1))).toEqual([
      cell(2, 1),
      cell(1, 2),
      cell(0, 1),
      cell(1, 0),
    ]);
  });
});
