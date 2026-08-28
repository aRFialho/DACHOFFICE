import type { OfficeNavigationCell } from "./navigation-grid.js";

export const projectOfficeNavigationRoute = (
  cells: readonly OfficeNavigationCell[],
  origin: Readonly<{ x: number; y: number }>,
  tileSize: Readonly<{ height: number; width: number }>,
): readonly Readonly<{ x: number; y: number }>[] =>
  cells.map(({ column, row }) => ({
    x: origin.x + (column - row) * (tileSize.width / 2),
    y: origin.y + (column + row) * (tileSize.height / 2),
  }));
