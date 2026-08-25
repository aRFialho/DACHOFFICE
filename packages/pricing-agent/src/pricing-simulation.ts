import type { ComponentConfidence, Money } from "@dachbyte-office/finance";
import {
  assertPricingSimulationInput,
  type PricingFeeAssumption,
  type PricingFinding,
  type PricingProductInput,
  type PricingSimulationInput,
  type PricingSimulationLine,
  type PricingSimulationReport,
} from "./contracts.js";
import {
  ceilDivide,
  MONEY_SCALE,
  PERCENT_SCALE,
  roundHalfUp,
  toMoney,
  toScaled,
} from "./decimal.js";

export function simulatePricing(
  value: PricingSimulationInput,
): PricingSimulationReport {
  const input = assertPricingSimulationInput(value);
  const lines = input.products.map((product) =>
    simulateProduct(product, input.feeAssumptions, input.request.discountPercent),
  );
  const hasFindings = lines.some((line) => line.findings.length > 0);
  return {
    status: hasFindings ? "completed_with_findings" : "completed",
    confidence: aggregateConfidence(lines.map((line) => line.confidence)),
    lines,
    provenance: {
      officeId: input.request.officeId,
      taskId: input.request.taskId,
      agentId: input.request.agentId,
      agentVersionId: input.request.agentVersionId,
      channel: input.request.channel,
      periodStart: input.request.periodStart,
      periodEnd: input.request.periodEnd,
      costSourceReferences: uniqueSorted(
        lines.flatMap((line) =>
          line.cost === undefined ? [] : [line.cost.sourceReference],
        ),
      ),
      listingSourceReferences: uniqueSorted(
        lines.flatMap((line) =>
          line.listing === undefined ? [] : [line.listing.sourceReference],
        ),
      ),
      feeRuleIds: uniqueSorted(lines.flatMap((line) => line.feeRuleIds)),
    },
  };
}

function simulateProduct(
  product: PricingProductInput,
  assumptions: readonly PricingFeeAssumption[],
  discountPercent: Money,
): PricingSimulationLine {
  const findings: PricingFinding[] = [];
  if (product.cost.status === "missing")
    findings.push({ type: "cost_missing", sku: product.sku });
  if (product.listing.status === "missing")
    findings.push({ type: "listing_missing", sku: product.sku });
  if (product.cost.status === "found" && product.listing.status === "found") {
    if (product.cost.currency !== product.listing.currency)
      findings.push({ type: "currency_mismatch", sku: product.sku });
  }
  const sellerAssumptions = assumptions.filter(
    (assumption) => assumption.payer === "seller",
  );
  if (sellerAssumptions.length === 0)
    findings.push({ type: "finance_assumptions_missing", sku: product.sku });
  if (findings.length > 0)
    return unresolvedLine(product, sellerAssumptions, findings);

  const cost = product.cost;
  const listing = product.listing;
  if (cost.status !== "found" || listing.status !== "found")
    return unresolvedLine(product, sellerAssumptions, findings);
  const fees = sellerFees(sellerAssumptions, listing.currency);
  if (fees.status === "invalid")
    return unresolvedLine(product, sellerAssumptions, [
      { type: "finance_assumptions_invalid", sku: product.sku },
    ]);
  if (fees.variablePercent >= PERCENT_SCALE)
    return unresolvedLine(product, sellerAssumptions, [
      { type: "fee_rate_unresolvable", sku: product.sku },
    ]);

  const breakEvenMinimum = toMoney(
    ceilDivide(
      (toScaled(cost.cost) + fees.fixed) * PERCENT_SCALE,
      PERCENT_SCALE - fees.variablePercent,
    ),
    "breakEvenMinimumPrice",
  );
  const currentPrice = toScaled(listing.price);
  const discountedPrice = toMoney(
    roundHalfUp(
      currentPrice * (PERCENT_SCALE - toScaled(discountPercent)),
      PERCENT_SCALE,
    ),
    "discountedPrice",
  );
  const minimumScaled = toScaled(breakEvenMinimum);
  const safeDiscount =
    currentPrice <= minimumScaled
      ? 0n
      : ((currentPrice - minimumScaled) * PERCENT_SCALE) / currentPrice;
  const actionStatus =
    toScaled(discountedPrice) >= minimumScaled
      ? "prepared"
      : "below_break_even";
  const lineFindings: PricingFinding[] =
    actionStatus === "below_break_even"
      ? [
          {
            type: "discount_below_break_even",
            sku: product.sku,
            discountedPrice,
            breakEvenMinimumPrice: breakEvenMinimum,
          },
        ]
      : [];
  return {
    productId: product.productId,
    sku: product.sku,
    name: product.name,
    actionStatus,
    confidence: confidenceFor(sellerAssumptions),
    findings: lineFindings,
    currentPrice: listing.price,
    discountedPrice,
    breakEvenMinimumPrice: breakEvenMinimum,
    maximumSafeDiscountPercent: toMoney(
      safeDiscount,
      "maximumSafeDiscountPercent",
    ),
    sellerFixedFees: toMoney(fees.fixed, "sellerFixedFees"),
    sellerVariableFeePercent: toMoney(
      fees.variablePercent,
      "sellerVariableFeePercent",
    ),
    cost,
    listing,
    feeRuleIds: uniqueSorted(sellerAssumptions.map((fee) => fee.ruleId)),
  };
}

function unresolvedLine(
  product: PricingProductInput,
  assumptions: readonly PricingFeeAssumption[],
  findings: PricingFinding[],
): PricingSimulationLine {
  return {
    productId: product.productId,
    sku: product.sku,
    name: product.name,
    actionStatus: "unresolved",
    confidence: "ESTIMATED",
    findings,
    ...(product.cost.status === "found" ? { cost: product.cost } : {}),
    ...(product.listing.status === "found" ? { listing: product.listing } : {}),
    feeRuleIds: uniqueSorted(assumptions.map((fee) => fee.ruleId)),
  };
}

function sellerFees(
  assumptions: readonly PricingFeeAssumption[],
  currency: string,
):
  | { status: "valid"; fixed: bigint; variablePercent: bigint }
  | { status: "invalid" } {
  let fixed = 0n;
  let variablePercent = 0n;
  for (const assumption of assumptions) {
    const value = toScaled(assumption.value);
    if (value < 0n) return { status: "invalid" };
    if (assumption.feeMode === "fixed") {
      if (assumption.currency !== currency) return { status: "invalid" };
      fixed += value;
    } else {
      variablePercent += value;
    }
  }
  return { status: "valid", fixed, variablePercent };
}

function confidenceFor(
  assumptions: readonly PricingFeeAssumption[],
): ComponentConfidence {
  return assumptions.every((assumption) => assumption.confidence === "REAL")
    ? "REAL"
    : "ESTIMATED";
}

function aggregateConfidence(
  confidences: readonly ComponentConfidence[],
): ComponentConfidence {
  return confidences.every((confidence) => confidence === "REAL")
    ? "REAL"
    : "ESTIMATED";
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
