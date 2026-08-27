import financeDeskFile from "./furniture/finance-analyst-desk-v1.png";
import financeAnalystAtlasFile from "./agents/finance-analyst-atlas-v1.png";

export type OfficeRepresentativeAssetId =
  | "furniture.analyst_desk"
  | "agent.finance_analyst";

export interface OfficeRepresentativeAsset {
  readonly id: OfficeRepresentativeAssetId;
  readonly label: string;
  readonly kind: "furniture" | "atlas_source";
  readonly src: string;
}

export const officeRepresentativeAssets: readonly OfficeRepresentativeAsset[] =
  [
    {
      id: "furniture.analyst_desk",
      label: "Finance analyst workstation",
      kind: "furniture",
      src: financeDeskFile,
    },
    {
      id: "agent.finance_analyst",
      label: "Finance analyst orientation source atlas",
      kind: "atlas_source",
      src: financeAnalystAtlasFile,
    },
  ] as const;

export {
  financeAnalystAtlasFile as financeAnalystAtlasAsset,
  financeDeskFile as financeDeskAsset,
};
