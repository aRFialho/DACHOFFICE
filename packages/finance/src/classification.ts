import type {
  ActualFinancialEvidence,
  ChannelFeeRule,
  ClassifiedFinancialComponent,
  FinanceRuleVersion,
} from "./contracts.js";

export function classifyActualFinancialEvidence(
  ruleVersion: FinanceRuleVersion,
  evidence: ActualFinancialEvidence,
): ClassifiedFinancialComponent {
  const mapping = ruleVersion.rulesJson.rawCodeMappings[evidence.rawCode];
  return {
    amount: evidence.amount,
    currency: evidence.currency,
    componentType: mapping?.componentType ?? "other",
    payer: mapping?.payer ?? "unknown",
    source: evidence.source,
    rawCode: evidence.rawCode,
    ...optionalField(evidence.sourceReference, "sourceReference"),
    confidence: "REAL",
    ...optionalField(evidence.orderItemId, "orderItemId"),
  };
}

export function selectEstimatedFeeRules(input: {
  ruleVersion: FinanceRuleVersion;
  feeRules: readonly ChannelFeeRule[];
  channel: string;
  occurredAt: Date;
  actualComponents: readonly ClassifiedFinancialComponent[];
}): readonly ChannelFeeRule[] {
  const realComponentPairs = new Set(
    input.actualComponents
      .filter((component) => component.confidence === "REAL")
      .map((component) =>
        componentKey(component.componentType, component.payer),
      ),
  );
  return input.feeRules.filter(
    (rule) =>
      rule.financeRuleVersionId === input.ruleVersion.id &&
      rule.channel === input.channel &&
      isValidAt(rule, input.occurredAt) &&
      !realComponentPairs.has(componentKey(rule.componentType, rule.payer)),
  );
}

function isValidAt(rule: ChannelFeeRule, occurredAt: Date): boolean {
  return (
    (rule.validFrom === undefined || rule.validFrom <= occurredAt) &&
    (rule.validTo === undefined || rule.validTo >= occurredAt)
  );
}

function componentKey(componentType: string, payer: string): string {
  return `${componentType}:${payer}`;
}

function optionalField<K extends string>(
  value: string | undefined,
  key: K,
): { [P in K]?: string } {
  return value === undefined ? {} : ({ [key]: value } as { [P in K]?: string });
}
