import type {
  OfficeNavigationCell,
  OfficeNavigationGrid,
} from "./navigation-grid.js";

const cellKey = ({ column, row }: OfficeNavigationCell): string =>
  `${column}:${row}`;

const sameCell = (
  left: OfficeNavigationCell,
  right: OfficeNavigationCell,
): boolean => left.column === right.column && left.row === right.row;

const manhattanDistance = (
  left: OfficeNavigationCell,
  right: OfficeNavigationCell,
): number =>
  Math.abs(left.column - right.column) + Math.abs(left.row - right.row);

const reconstructPath = (
  target: OfficeNavigationCell,
  previous: ReadonlyMap<string, OfficeNavigationCell>,
): readonly OfficeNavigationCell[] => {
  const path = [target];
  let current = target;

  while (previous.has(cellKey(current))) {
    current = previous.get(cellKey(current))!;
    path.unshift(current);
  }

  return path;
};

export const findOfficeAStarPath = (
  grid: OfficeNavigationGrid,
  start: OfficeNavigationCell,
  target: OfficeNavigationCell,
): readonly OfficeNavigationCell[] | undefined => {
  if (!grid.isWalkable(start) || !grid.isWalkable(target)) {
    return undefined;
  }

  const open = [start];
  const previous = new Map<string, OfficeNavigationCell>();
  const distance = new Map<string, number>([[cellKey(start), 0]]);

  while (open.length > 0) {
    open.sort((left, right) => {
      const leftDistance = distance.get(cellKey(left))!;
      const rightDistance = distance.get(cellKey(right))!;
      const scoreDifference =
        leftDistance +
        manhattanDistance(left, target) -
        (rightDistance + manhattanDistance(right, target));

      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      return manhattanDistance(left, target) - manhattanDistance(right, target);
    });
    const current = open.shift()!;

    if (sameCell(current, target)) {
      return reconstructPath(current, previous);
    }

    const nextDistance = distance.get(cellKey(current))! + 1;
    for (const neighbour of grid.neighbours(current)) {
      const neighbourKey = cellKey(neighbour);
      const knownDistance = distance.get(neighbourKey);

      if (knownDistance !== undefined && knownDistance <= nextDistance) {
        continue;
      }

      previous.set(neighbourKey, current);
      distance.set(neighbourKey, nextDistance);
      if (!open.some((candidate) => sameCell(candidate, neighbour))) {
        open.push(neighbour);
      }
    }
  }

  return undefined;
};
