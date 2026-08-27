export interface OfficeNavigationCell {
  readonly column: number;
  readonly row: number;
}

export interface OfficeNavigationConstraint {
  readonly position: Readonly<{ x: number; y: number }>;
  readonly size: Readonly<{ height: number; width: number }>;
}

export interface OfficeNavigationGridInput {
  readonly constraints: readonly OfficeNavigationConstraint[];
  readonly height: number;
  readonly tileSize: Readonly<{ height: number; width: number }>;
  readonly width: number;
}

export interface OfficeNavigationGrid {
  readonly height: number;
  readonly width: number;
  cellFromPosition(
    position: Readonly<{ x: number; y: number }>,
  ): OfficeNavigationCell | undefined;
  isWalkable(cell: OfficeNavigationCell): boolean;
  neighbours(cell: OfficeNavigationCell): readonly OfficeNavigationCell[];
}

const cellKey = ({ column, row }: OfficeNavigationCell): string =>
  `${column}:${row}`;

const isCellInBounds = (
  { column, row }: OfficeNavigationCell,
  width: number,
  height: number,
): boolean =>
  Number.isInteger(column) &&
  Number.isInteger(row) &&
  column >= 0 &&
  row >= 0 &&
  column < width &&
  row < height;

const blockedCellsForConstraint = (
  constraint: OfficeNavigationConstraint,
  tileSize: OfficeNavigationGridInput["tileSize"],
): readonly OfficeNavigationCell[] => {
  const firstColumn = Math.floor(constraint.position.x / tileSize.width);
  const lastColumn =
    Math.ceil(
      (constraint.position.x + constraint.size.width) / tileSize.width,
    ) - 1;
  const firstRow = Math.floor(constraint.position.y / tileSize.height);
  const lastRow =
    Math.ceil(
      (constraint.position.y + constraint.size.height) / tileSize.height,
    ) - 1;
  const cells: OfficeNavigationCell[] = [];

  for (let row = firstRow; row <= lastRow; row += 1) {
    for (let column = firstColumn; column <= lastColumn; column += 1) {
      cells.push({ column, row });
    }
  }

  return cells;
};

export const createOfficeNavigationGrid = ({
  constraints,
  height,
  tileSize,
  width,
}: OfficeNavigationGridInput): OfficeNavigationGrid => {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    tileSize.width <= 0 ||
    tileSize.height <= 0
  ) {
    throw new Error("navigation grid requires positive integer dimensions");
  }

  const blocked = new Set(
    constraints
      .flatMap((constraint) => blockedCellsForConstraint(constraint, tileSize))
      .filter((cell) => isCellInBounds(cell, width, height))
      .map(cellKey),
  );
  const isWalkable = (cell: OfficeNavigationCell): boolean =>
    isCellInBounds(cell, width, height) && !blocked.has(cellKey(cell));

  return {
    height,
    width,
    cellFromPosition: ({ x, y }) => {
      const cell = {
        column: Math.floor(x / tileSize.width),
        row: Math.floor(y / tileSize.height),
      };

      return isCellInBounds(cell, width, height) ? cell : undefined;
    },
    isWalkable,
    neighbours: ({ column, row }) =>
      [
        { column: column + 1, row },
        { column, row: row + 1 },
        { column: column - 1, row },
        { column, row: row - 1 },
      ].filter(isWalkable),
  };
};
