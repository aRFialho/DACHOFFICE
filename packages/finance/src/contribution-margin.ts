import {
  assertClassifiedFinancialComponent,
  assertComponentConfidence,
  assertMoney,
  assertRevenueBasis,
  type ClassifiedFinancialComponent,
  type ComponentConfidence,
  type Money,
  type RevenueBasis,
} from "./contracts.js";

const MONEY_SCALE = 10_000n;

export interface MarginAmount {
  amount: Money;
  confidence: ComponentConfidence;
}

export interface MarginComponent extends ClassifiedFinancialComponent {
  componentId: string;
}

export interface SellerItemDiscount extends MarginAmount {
  orderItemId: string;
}

export interface MarginEvidenceMetadata {
  calculatedAt: string;
  source: string;
}

export interface ContributionMarginCalculationInput {
  snapshotId: string;
  officeId: string;
  orderHeaderId: string;
  financeRuleVersionId: string;
  calculationVersion: string;
  revenueBasis: RevenueBasis;
  revenueAmounts: Record<string, MarginAmount>;
  cmv: MarginAmount;
  components: MarginComponent[];
  sellerItemDiscounts: SellerItemDiscount[];
  evidenceMetadata: MarginEvidenceMetadata;
}

export interface ContributionMarginEvidence {
  revenue: MarginAmount;
  revenueAmounts: Record<string, MarginAmount>;
  cmv: MarginAmount;
  components: MarginComponent[];
  sellerItemDiscounts: SellerItemDiscount[];
  includedComponentIds: string[];
  financeRuleVersionId: string;
  calculationVersion: string;
  metadata: MarginEvidenceMetadata;
}

export interface ContributionMarginSnapshot {
  id: string;
  officeId: string;
  orderHeaderId: string;
  financeRuleVersionId: string;
  revenueBasis: RevenueBasis;
  cmv: Money;
  taxes: Money;
  marketplaceFees: Money;
  sellerDiscounts: Money;
  logistics: Money;
  adsCost: Money;
  otherCosts: Money;
  contributionAmount: Money;
  contributionPercent: Money;
  confidence: ComponentConfidence;
  calculationVersion: string;
  calculatedAt: string;
  evidence: ContributionMarginEvidence;
}

export function calculateContributionMargin(
  input: ContributionMarginCalculationInput,
): ContributionMarginSnapshot {
  const parsed = assertContributionMarginCalculationInput(input);
  const revenue = parsed.revenueAmounts[parsed.revenueBasis];
  if (revenue === undefined)
    throw new Error("revenueAmounts must include the selected revenueBasis");
  const revenueScaled = toScaled(revenue.amount);
  if (revenueScaled === 0n)
    throw new Error("selected revenue amount must not be zero");

  const components = deduplicateComponents(parsed.components);
  const sellerItemDiscounts = deduplicateSellerItemDiscounts(
    parsed.sellerItemDiscounts,
  );
  const realComponentPairs = new Set(
    components
      .filter((component) => component.confidence === "REAL")
      .map((component) => componentPair(component)),
  );
  const unsuppressedComponents = components.filter(
    (component) =>
      component.confidence === "REAL" ||
      !realComponentPairs.has(componentPair(component)),
  );

  let taxes = 0n;
  let marketplaceFees = 0n;
  let sellerDiscounts = sumAmounts(sellerItemDiscounts);
  let logistics = 0n;
  let adsCost = 0n;
  let otherCosts = 0n;
  const includedComponents: MarginComponent[] = [];

  for (const component of unsuppressedComponents) {
    const category = sellerCostCategory(component);
    if (category === undefined) continue;
    includedComponents.push(component);
    const amount = toScaled(component.amount);
    if (category === "taxes") taxes += amount;
    if (category === "marketplaceFees") marketplaceFees += amount;
    if (category === "sellerDiscounts") sellerDiscounts += amount;
    if (category === "logistics") logistics += amount;
    if (category === "adsCost") adsCost += amount;
    if (category === "otherCosts") otherCosts += amount;
  }

  const contributionAmount =
    revenueScaled -
    toScaled(parsed.cmv.amount) -
    taxes -
    marketplaceFees -
    sellerDiscounts -
    logistics -
    adsCost -
    otherCosts;
  const confidence = hasOnlyRealInputs([
    revenue,
    parsed.cmv,
    ...sellerItemDiscounts,
    ...includedComponents,
  ])
    ? "REAL"
    : "ESTIMATED";

  return {
    id: parsed.snapshotId,
    officeId: parsed.officeId,
    orderHeaderId: parsed.orderHeaderId,
    financeRuleVersionId: parsed.financeRuleVersionId,
    revenueBasis: parsed.revenueBasis,
    cmv: toMoney(toScaled(parsed.cmv.amount), "cmv"),
    taxes: toMoney(taxes, "taxes"),
    marketplaceFees: toMoney(marketplaceFees, "marketplaceFees"),
    sellerDiscounts: toMoney(sellerDiscounts, "sellerDiscounts"),
    logistics: toMoney(logistics, "logistics"),
    adsCost: toMoney(adsCost, "adsCost"),
    otherCosts: toMoney(otherCosts, "otherCosts"),
    contributionAmount: toMoney(contributionAmount, "contributionAmount"),
    contributionPercent: toMoney(
      roundHalfUp(contributionAmount * 100n * MONEY_SCALE, revenueScaled),
      "contributionPercent",
    ),
    confidence,
    calculationVersion: parsed.calculationVersion,
    calculatedAt: parsed.evidenceMetadata.calculatedAt,
    evidence: {
      revenue,
      revenueAmounts: parsed.revenueAmounts,
      cmv: parsed.cmv,
      components,
      sellerItemDiscounts,
      includedComponentIds: includedComponents.map(
        (component) => component.componentId,
      ),
      financeRuleVersionId: parsed.financeRuleVersionId,
      calculationVersion: parsed.calculationVersion,
      metadata: parsed.evidenceMetadata,
    },
  };
}

export function assertContributionMarginCalculationInput(
  value: unknown,
): ContributionMarginCalculationInput {
  const input = assertRecord(value, "contribution margin calculation input");
  const revenueBasis = assertRevenueBasis(input.revenueBasis, "revenueBasis");
  const revenueAmounts = assertRevenueAmounts(input.revenueAmounts);
  return {
    snapshotId: assertNonBlankString(input.snapshotId, "snapshotId"),
    officeId: assertNonBlankString(input.officeId, "officeId"),
    orderHeaderId: assertNonBlankString(input.orderHeaderId, "orderHeaderId"),
    financeRuleVersionId: assertNonBlankString(
      input.financeRuleVersionId,
      "financeRuleVersionId",
    ),
    calculationVersion: assertNonBlankString(
      input.calculationVersion,
      "calculationVersion",
    ),
    revenueBasis,
    revenueAmounts,
    cmv: assertMarginAmount(input.cmv, "cmv"),
    components: assertArray(input.components, "components").map(
      assertMarginComponent,
    ),
    sellerItemDiscounts: assertArray(
      input.sellerItemDiscounts,
      "sellerItemDiscounts",
    ).map(assertSellerItemDiscount),
    evidenceMetadata: assertMarginEvidenceMetadata(input.evidenceMetadata),
  };
}

function assertRevenueAmounts(value: unknown): Record<string, MarginAmount> {
  const amounts = assertRecord(value, "revenueAmounts");
  const parsed: Record<string, MarginAmount> = {};
  for (const [basis, amount] of Object.entries(amounts)) {
    assertRevenueBasis(basis, "revenueAmounts key");
    parsed[basis] = assertMarginAmount(amount, `revenueAmounts.${basis}`);
  }
  return parsed;
}

function assertMarginAmount(value: unknown, field: string): MarginAmount {
  const amount = assertRecord(value, field);
  return {
    amount: assertMoney(amount.amount, `${field}.amount`),
    confidence: assertComponentConfidence(amount.confidence),
  };
}

function assertMarginComponent(value: unknown): MarginComponent {
  const component = assertRecord(value, "margin component");
  return {
    componentId: assertNonBlankString(component.componentId, "componentId"),
    ...assertClassifiedFinancialComponent(component),
  };
}

function assertSellerItemDiscount(value: unknown): SellerItemDiscount {
  const discount = assertRecord(value, "seller item discount");
  return {
    orderItemId: assertNonBlankString(discount.orderItemId, "orderItemId"),
    ...assertMarginAmount(discount, "seller item discount"),
  };
}

function assertMarginEvidenceMetadata(value: unknown): MarginEvidenceMetadata {
  const metadata = assertRecord(value, "evidenceMetadata");
  const calculatedAt = assertNonBlankString(
    metadata.calculatedAt,
    "calculatedAt",
  );
  if (Number.isNaN(Date.parse(calculatedAt)))
    throw new Error("calculatedAt must be a valid timestamp");
  return {
    calculatedAt,
    source: assertNonBlankString(metadata.source, "evidenceMetadata.source"),
  };
}

function deduplicateComponents(
  components: readonly MarginComponent[],
): MarginComponent[] {
  const unique = new Map<string, MarginComponent>();
  for (const component of components) {
    const identity = componentEvidenceIdentity(component);
    const existing = unique.get(identity);
    if (existing === undefined) {
      unique.set(identity, component);
    } else if (!sameComponent(existing, component)) {
      throw new Error(
        "duplicate component evidence has conflicting amount or confidence",
      );
    }
  }
  return [...unique.values()];
}

function deduplicateSellerItemDiscounts(
  discounts: readonly SellerItemDiscount[],
): SellerItemDiscount[] {
  const unique = new Map<string, SellerItemDiscount>();
  for (const discount of discounts) {
    const existing = unique.get(discount.orderItemId);
    if (existing === undefined) {
      unique.set(discount.orderItemId, discount);
    } else if (
      existing.amount !== discount.amount ||
      existing.confidence !== discount.confidence
    ) {
      throw new Error("duplicate orderItemId has conflicting seller discounts");
    }
  }
  return [...unique.values()];
}

function componentEvidenceIdentity(component: MarginComponent): string {
  if (component.sourceReference === undefined)
    return `component:${component.componentId}`;
  return JSON.stringify([
    component.source,
    component.sourceReference,
    component.rawCode ?? null,
    component.componentType,
    component.payer,
    component.currency,
    component.orderItemId ?? null,
  ]);
}

function sameComponent(left: MarginComponent, right: MarginComponent): boolean {
  return (
    left.amount === right.amount &&
    left.currency === right.currency &&
    left.componentType === right.componentType &&
    left.payer === right.payer &&
    left.source === right.source &&
    left.rawCode === right.rawCode &&
    left.sourceReference === right.sourceReference &&
    left.confidence === right.confidence &&
    left.orderItemId === right.orderItemId
  );
}

function sellerCostCategory(
  component: MarginComponent,
):
  | "taxes"
  | "marketplaceFees"
  | "sellerDiscounts"
  | "logistics"
  | "adsCost"
  | "otherCosts"
  | undefined {
  if (component.payer !== "seller") return undefined;
  if (component.componentType === "tax") return "taxes";
  if (
    component.componentType === "marketplace_commission" ||
    component.componentType === "fixed_fee" ||
    component.componentType === "service_fee" ||
    component.componentType === "payment_fee"
  )
    return "marketplaceFees";
  if (
    component.componentType === "seller_coupon" ||
    component.componentType === "seller_rebate"
  )
    return "sellerDiscounts";
  if (component.componentType === "seller_freight") return "logistics";
  if (component.componentType === "ads_attribution") return "adsCost";
  if (component.componentType === "other") return "otherCosts";
  return undefined;
}

function componentPair(component: MarginComponent): string {
  return `${component.componentType}:${component.payer}`;
}

function sumAmounts(amounts: readonly MarginAmount[]): bigint {
  return amounts.reduce((sum, item) => sum + toScaled(item.amount), 0n);
}

function hasOnlyRealInputs(
  amounts: readonly { confidence: ComponentConfidence }[],
): boolean {
  return amounts.every((amount) => amount.confidence === "REAL");
}

function toScaled(value: Money): bigint {
  const [whole, fraction = ""] = value.replace("-", "").split(".");
  const digits = `${whole ?? "0"}${fraction.padEnd(4, "0")}`;
  const scaled = BigInt(digits);
  return value.startsWith("-") ? -scaled : scaled;
}

function toMoney(value: bigint, field: string): Money {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / MONEY_SCALE;
  const fraction = (absolute % MONEY_SCALE).toString().padStart(4, "0");
  return assertMoney(`${negative ? "-" : ""}${whole}.${fraction}`, field);
}

function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const normalizedNumerator = denominator < 0n ? -numerator : numerator;
  const normalizedDenominator = denominator < 0n ? -denominator : denominator;
  const negative = normalizedNumerator < 0n;
  const absoluteNumerator = negative
    ? -normalizedNumerator
    : normalizedNumerator;
  const quotient = absoluteNumerator / normalizedDenominator;
  const remainder = absoluteNumerator % normalizedDenominator;
  const rounded =
    remainder * 2n >= normalizedDenominator ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

function assertRecord(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${field} must be an object`);
  return value as Record<string, unknown>;
}

function assertArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value;
}

function assertNonBlankString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "")
    throw new Error(`${field} must be a non-blank string`);
  return value;
}
