import {
  resolveOfficeNavigationRoute,
  type OfficeNavigationRoute,
} from "./navigation-route.js";
import type { OfficeNavigationGrid } from "./navigation-grid.js";
import { projectOfficeNavigationRoute } from "./navigation-route-overlay.js";
import type { OfficeRendererDestination } from "./tiled-map.js";

export interface FixtureAgentRoute {
  readonly cells: OfficeNavigationRoute["cells"];
  readonly destinationId: string;
  readonly points: readonly Readonly<{ x: number; y: number }>[];
  readonly start: Readonly<{ x: number; y: number }>;
  readonly target: Readonly<{ x: number; y: number }>;
}

export interface CreateFixtureAgentRouteInput {
  readonly destinations: readonly OfficeRendererDestination[];
  readonly grid: OfficeNavigationGrid;
  readonly origin: Readonly<{ x: number; y: number }>;
  readonly startDestinationId: string;
  readonly targetDestinationId: string;
  readonly tileSize: Readonly<{ height: number; width: number }>;
}

const destinationFor = (
  destinations: readonly OfficeRendererDestination[],
  id: string,
): OfficeRendererDestination => {
  const destination = destinations.find((entry) => entry.id === id);

  if (destination === undefined) {
    throw new Error(`unknown fixture destination: ${id}`);
  }

  return destination;
};

export const createFixtureAgentRoute = ({
  destinations,
  grid,
  origin,
  startDestinationId,
  targetDestinationId,
  tileSize,
}: CreateFixtureAgentRouteInput): FixtureAgentRoute => {
  const startDestination = destinationFor(destinations, startDestinationId);
  destinationFor(destinations, targetDestinationId);
  const start = grid.cellFromPosition(startDestination.position);

  if (start === undefined) {
    throw new Error(
      `fixture route start is outside the map: ${startDestinationId}`,
    );
  }

  const route = resolveOfficeNavigationRoute({
    destinationId: targetDestinationId,
    destinations,
    grid,
    start,
  });

  if (route === undefined) {
    throw new Error(
      `fixture route cannot reach destination: ${targetDestinationId}`,
    );
  }

  const points = projectOfficeNavigationRoute(route.cells, origin, tileSize);

  if (points.length === 0) {
    throw new Error(
      `fixture route has no projected points: ${targetDestinationId}`,
    );
  }

  return {
    cells: route.cells,
    destinationId: route.destinationId,
    points,
    start: points[0]!,
    target: points.at(-1)!,
  };
};

export const positionForFixtureRoute = (
  route: FixtureAgentRoute,
  progress: number,
): Readonly<{ x: number; y: number }> => {
  const bounded = Math.min(1, Math.max(0, progress));
  const segmentCount = route.points.length - 1;

  if (segmentCount === 0) {
    return route.start;
  }

  const offset = bounded * segmentCount;
  const index = Math.min(segmentCount - 1, Math.floor(offset));
  const segmentProgress = offset - index;
  const start = route.points[index]!;
  const target = route.points[index + 1]!;

  return {
    x: start.x + (target.x - start.x) * segmentProgress,
    y: start.y + (target.y - start.y) * segmentProgress,
  };
};
