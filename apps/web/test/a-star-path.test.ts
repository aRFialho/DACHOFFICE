import { describe, expect, it } from "vitest";
import { findOfficeAStarPath } from "../src/office/renderer/a-star-path.js";
import {
  createOfficeNavigationGrid,
  type OfficeNavigationCell,
} from "../src/office/renderer/navigation-grid.js";

const cell = (column: number, row: number): OfficeNavigationCell => ({
  column,
  row,
});

const grid = (
  constraints: readonly {
    position: { x: number; y: number };
    size: { height: number; width: number };
  }[] = [],
) =>
  createOfficeNavigationGrid({
    constraints,
    height: 3,
    tileSize: { height: 32, width: 64 },
    width: 4,
  });

describe("findOfficeAStarPath", () => {
  it("returns the shortest cardinal path", () => {
    expect(findOfficeAStarPath(grid(), cell(0, 0), cell(3, 0))).toEqual([
      cell(0, 0),
      cell(1, 0),
      cell(2, 0),
      cell(3, 0),
    ]);
  });

  it("uses the stable route when a blocker requires a detour", () => {
    expect(
      findOfficeAStarPath(
        grid([{ position: { x: 64, y: 0 }, size: { height: 32, width: 64 } }]),
        cell(0, 0),
        cell(3, 0),
      ),
    ).toEqual([
      cell(0, 0),
      cell(0, 1),
      cell(1, 1),
      cell(2, 1),
      cell(3, 1),
      cell(3, 0),
    ]);
  });

  it("returns undefined when the target is blocked", () => {
    expect(
      findOfficeAStarPath(
        grid([{ position: { x: 192, y: 0 }, size: { height: 32, width: 64 } }]),
        cell(0, 0),
        cell(3, 0),
      ),
    ).toBeUndefined();
  });
});
