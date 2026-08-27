export interface DepthSortable {
  readonly footY: number;
  readonly id: string;
  readonly layerOrder: number;
}

export const sortByOfficeDepth = <Entry extends DepthSortable>(
  entries: readonly Entry[],
): readonly Entry[] =>
  entries
    .map((entry, inputOrder) => ({ entry, inputOrder }))
    .sort(
      (left, right) =>
        left.entry.layerOrder - right.entry.layerOrder ||
        left.entry.footY - right.entry.footY ||
        left.inputOrder - right.inputOrder,
    )
    .map(({ entry }) => entry);
