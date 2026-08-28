export interface FinanceRuleVersionRead {
  id: string;
  ruleSetId: string;
  version: number;
  rulesJson: { rawCodeMappings: Record<string, unknown> };
  createdAt: string;
}

export interface FinanceMarginSnapshotRead {
  id: string;
  financeRuleVersionId: string;
  revenueBasis: string;
  cmv: string;
  taxes: string;
  marketplaceFees: string;
  sellerDiscounts: string;
  logistics: string;
  adsCost: string;
  otherCosts: string;
  contributionAmount: string;
  contributionPercent: string;
  confidence: "REAL" | "ESTIMATED";
  calculationVersion: string;
  calculatedAt: string;
  evidence: Record<string, unknown>;
}

export interface ConfiguredChannelFeeRule {
  channel: string;
  componentType: string;
  payer: string;
  feeMode: string;
  value: string;
  currency?: string;
  source: string;
  rawCode?: string;
  confidence: "ESTIMATED";
  validFrom?: Date;
  validTo?: Date;
}

export interface CreateFinanceRuleVersionInput {
  officeId: string;
  ruleSetId: string;
  version: number;
  rulesJson: { rawCodeMappings: Record<string, unknown> };
  channelFeeRules: readonly ConfiguredChannelFeeRule[];
}

export interface FinanceService {
  getLatestRuleVersion(
    officeId: string,
  ): Promise<
    | { status: "found"; ruleVersion: FinanceRuleVersionRead }
    | { status: "not_found" }
  >;
  getLatestMarginSnapshot(
    officeId: string,
    orderHeaderId: string,
  ): Promise<
    | { status: "found"; snapshot: FinanceMarginSnapshotRead }
    | { status: "not_found" }
  >;
  createRuleVersion(
    input: CreateFinanceRuleVersionInput,
  ): Promise<
    | { status: "created"; ruleVersionId: string }
    | { status: "unchanged" }
    | { status: "conflict" }
  >;
}
