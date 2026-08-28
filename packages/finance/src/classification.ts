import type {
  ActualFinancialEvidence,
  ChannelFeeRule,
  ClassifiedFinancialComponent,
  FinanceRuleVersion,
  Money,
} from "./contracts.js";
import { assertMoney } from "./contracts.js";
import { percentageOfMoney, toMoney, toScaled } from "./decimal.js";

export interface MaterializedEstimatedFeeComponent extends ClassifiedFinancialComponent {
  componentId: string;
}

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
  const candidates = input.feeRules.filter(
    (rule) =>
      rule.financeRuleVersionId === input.ruleVersion.id &&
      rule.channel === input.channel &&
      isValidAt(rule, input.occurredAt),
  );
  assertNoDuplicateEstimatedFeeRules(candidates);
  return candidates.filter(
    (rule) =>
      !realComponentPairs.has(componentKey(rule.componentType, rule.payer)),
  );
}

export function materializeEstimatedFeeComponents(input: {
  ruleVersion: FinanceRuleVersion;
  feeRules: readonly ChannelFeeRule[];
  channel: string;
  occurredAt: Date;
  selectedRevenue: { amount: Money; currency: string };
  actualComponents: readonly ClassifiedFinancialComponent[];
}): readonly MaterializedEstimatedFeeComponent[] {
  const selectedRevenueCurrency = assertCurrency(
    input.selectedRevenue.currency,
    "selectedRevenue.currency",
  );
  return selectEstimatedFeeRules(input).map((rule) => {
    const currency =
      rule.feeMode === "fixed"
        ? assertCurrency(rule.currency, "fixed fee rule currency")
        : selectedRevenueCurrency;
    const amount =
      rule.feeMode === "fixed"
        ? toMoney(toScaled(rule.value), `fixed fee rule ${rule.id} value`)
        : percentageOfMoney(
            input.selectedRevenue.amount,
            rule.value,
            `percentage fee rule ${rule.id} value`,
          );
    return {
      componentId: `estimated-fee-rule:${rule.id}`,
      amount,
      currency,
      componentType: rule.componentType,
      payer: rule.payer,
      source: rule.source,
      ...optionalField(rule.rawCode, "rawCode"),
      confidence: "ESTIMATED",
    };
  });
}

export interface EstimatedFeeRuleIdentity {
  channel: string;
  componentType: string;
  payer: string;
  feeMode: string;
  value: string;
  currency?: string;
  validFrom?: Date;
  validTo?: Date;
  source: string;
  rawCode?: string;
}

export function assertNoDuplicateEstimatedFeeRules(
  rules: readonly EstimatedFeeRuleIdentity[],
): void {
  const identities = new Set<string>();
  for (const rule of rules) {
    const identity = configuredFeeRuleIdentity(rule);
    if (identities.has(identity))
      throw new Error("duplicate configured channel fee rule");
    identities.add(identity);
  }
}

function configuredFeeRuleIdentity(rule: EstimatedFeeRuleIdentity): string {
  return JSON.stringify([
    rule.channel,
    rule.componentType,
    rule.payer,
    rule.feeMode,
    toMoney(
      toScaled(assertMoney(rule.value, "channel fee rule value")),
      "channel fee rule value",
    ),
    rule.currency ?? null,
    rule.validFrom?.toISOString() ?? null,
    rule.validTo?.toISOString() ?? null,
    rule.source,
    rule.rawCode ?? null,
  ]);
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

function assertCurrency(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value))
    throw new Error(`${field} must be a three-letter uppercase currency`);
  return value;
}

function optionalField<K extends string>(
  value: string | undefined,
  key: K,
): { [P in K]?: string } {
  return value === undefined ? {} : ({ [key]: value } as { [P in K]?: string });
}
