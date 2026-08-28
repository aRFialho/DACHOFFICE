import {
  officeRepresentativeAssets,
  type OfficeRepresentativeAsset,
} from "../assets/manifest.js";

export type OfficeAssetRegistry = ReadonlyMap<
  string,
  OfficeRepresentativeAsset
>;

export const createOfficeAssetRegistry = (): OfficeAssetRegistry =>
  new Map(
    officeRepresentativeAssets.map((asset) => [asset.id, asset] as const),
  );
