import { findOfficeAStarPath } from "./a-star-path.js";
import type {
  OfficeNavigationCell,
  OfficeNavigationGrid,
} from "./navigation-grid.js";
import type { OfficeRendererDestination } from "./tiled-map.js";

export interface OfficeNavigationRoute {
  readonly cells: readonly OfficeNavigationCell[];
  readonly destinationId: string;
}

export interface ResolveOfficeNavigationRouteInput {
  readonly destinationId: string;
  readonly destinations: readonly OfficeRendererDestination[];
  readonly grid: OfficeNavigationGrid;
  readonly start: OfficeNavigationCell;
}

export const resolveOfficeNavigationRoute = ({
  destinationId,
  destinations,
  grid,
  start,
}: ResolveOfficeNavigationRouteInput): OfficeNavigationRoute | undefined => {
  const destination = destinations.find((entry) => entry.id === destinationId);

  if (destination === undefined || !destination.walkable) {
    return undefined;
  }

  const target = grid.cellFromPosition(destination.position);

  if (target === undefined) {
    return undefined;
  }

  const cells = findOfficeAStarPath(grid, start, target);

  return cells === undefined ? undefined : { cells, destinationId };
};
