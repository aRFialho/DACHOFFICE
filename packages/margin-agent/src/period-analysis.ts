import type { ComponentConfidence, Money } from "@dachbyte-office/finance";
import { MONEY_SCALE, roundHalfUp, toMoney, toScaled } from "./decimal.js";
import {
  assertMarginPeriodAnalysisInput,
  type CanonicalCostLookup,
  type MarginDreAmounts,
  type MarginFinding,
  type MarginOrderReport,
  type MarginPeriodAnalysisInput,
  type MarginPeriodReport,
  type PersistedOrderMargin,
  type UnresolvedCostEvidence,
} from "./contracts.js";

export function analyzeMarginPeriod(
  input: MarginPeriodAnalysisInput,
): MarginPeriodReport {
  const parsed = assertMarginPeriodAnalysisInput(input);
  const matchingOrders = parsed.orders
    .filter((order) => matchesRequest(order, parsed.request))
    .sort(compareOrders);
  const costByOrderSku = indexCosts(parsed.costs);
  const orders = matchingOrders.map((order) =>
    toOrderReport(order, costByOrderSku),
  );
  const unresolvedCosts = orders
    .flatMap(unresolvedCostsForOrder)
    .sort(compareCosts);
  const totals = aggregateTotals(orders);
  const confidence = reportConfidence(orders, unresolvedCosts);
  const findings = findingsFor(totals, unresolvedCosts);
  const evidenceReferences = uniqueSorted([
    ...orders.flatMap((order) => order.evidenceReferences),
    ...orders.flatMap((order) =>
      order.costs.flatMap((cost) => cost.evidenceReferences),
    ),
    ...(parsed.consultations ?? []).flatMap(
      (consultation) => consultation.evidenceReferences,
    ),
  ]);

  return {
    status: orders.length === 0 ? "no_margin_snapshots" : "completed",
    confidence,
    orders,
    totals,
    findings,
    evidence: {
      unresolvedCosts,
      consultations: [...(parsed.consultations ?? [])].sort((left, right) =>
        left.consultationId.localeCompare(right.consultationId),
      ),
    },
    provenance: {
      officeId: parsed.request.officeId,
      taskId: parsed.request.taskId,
      agentId: parsed.request.agentId,
      agentVersionId: parsed.request.agentVersionId,
      periodStart: parsed.request.periodStart,
      periodEnd: parsed.request.periodEnd,
      ...(parsed.request.filters === undefined
        ? {}
        : { filters: cloneFilters(parsed.request.filters) }),
      snapshotIds: uniqueSorted(orders.map((order) => order.snapshotId)),
      financeRuleVersionIds: uniqueSorted(
        orders.map((order) => order.financeRuleVersionId),
      ),
      calculationVersions: uniqueSorted(
        orders.map((order) => order.calculationVersion),
      ),
      snapshotCalculatedAts: uniqueSorted(
        orders.map((order) => order.snapshotCalculatedAt),
      ),
      evidenceReferences,
    },
  };
}

function matchesRequest(
  order: PersistedOrderMargin,
  request: MarginPeriodAnalysisInput["request"],
): boolean {
  const orderedAt = Date.parse(order.orderedAt);
  if (
    orderedAt < Date.parse(request.periodStart) ||
    orderedAt > Date.parse(request.periodEnd)
  )
    return false;
  const channels = request.filters?.channels;
  if (channels !== undefined && !channels.includes(order.channel)) return false;
  const skus = request.filters?.skus;
  return skus === undefined || order.skus.some((sku) => skus.includes(sku));
}

function compareOrders(
  left: PersistedOrderMargin,
  right: PersistedOrderMargin,
): number {
  return (
    left.orderedAt.localeCompare(right.orderedAt) ||
    left.orderId.localeCompare(right.orderId) ||
    left.snapshotId.localeCompare(right.snapshotId)
  );
}

function indexCosts(
  costs: CanonicalCostLookup[],
): Map<string, CanonicalCostLookup> {
  const indexed = new Map<string, CanonicalCostLookup>();
  for (const cost of costs) {
    const key = costKey(cost.orderId, cost.sku);
    if (indexed.has(key)) throw new Error("duplicate canonical cost lookup");
    indexed.set(key, cost);
  }
  return indexed;
}

function toOrderReport(
  order: PersistedOrderMargin,
  costs: Map<string, CanonicalCostLookup>,
): MarginOrderReport {
  return {
    ...order,
    skus: [...order.skus],
    evidenceReferences: [...order.evidenceReferences],
    costs: order.skus.map(
      (sku) =>
        costs.get(costKey(order.orderId, sku)) ?? {
          status: "unresolved",
          orderId: order.orderId,
          sku,
          reason: "missing_cost",
          evidenceReferences: [],
        },
    ),
  };
}

function unresolvedCostsForOrder(
  order: MarginOrderReport,
): UnresolvedCostEvidence[] {
  return order.costs.flatMap((cost) =>
    cost.status === "unresolved"
      ? [
          {
            orderId: cost.orderId,
            sku: cost.sku,
            reason: cost.reason,
            evidenceReferences: [...cost.evidenceReferences],
          },
        ]
      : [],
  );
}

function aggregateTotals(orders: MarginOrderReport[]): MarginDreAmounts {
  const revenue = sumMoney(orders.map((order) => order.revenue));
  if (orders.length > 0 && toScaled(revenue) === 0n)
    throw new Error("period revenue must not be zero for a nonempty report");
  const contributionAmount = sumMoney(
    orders.map((order) => order.contributionAmount),
  );
  return {
    revenue,
    cmv: sumMoney(orders.map((order) => order.cmv)),
    taxes: sumMoney(orders.map((order) => order.taxes)),
    marketplaceFees: sumMoney(orders.map((order) => order.marketplaceFees)),
    sellerDiscounts: sumMoney(orders.map((order) => order.sellerDiscounts)),
    logistics: sumMoney(orders.map((order) => order.logistics)),
    adsCost: sumMoney(orders.map((order) => order.adsCost)),
    otherCosts: sumMoney(orders.map((order) => order.otherCosts)),
    contributionAmount,
    contributionPercent:
      orders.length === 0
        ? toMoney(0n, "contributionPercent")
        : toMoney(
            roundHalfUp(
              toScaled(contributionAmount) * 100n * MONEY_SCALE,
              toScaled(revenue),
            ),
            "contributionPercent",
          ),
  };
}

function reportConfidence(
  orders: MarginOrderReport[],
  unresolvedCosts: UnresolvedCostEvidence[],
): ComponentConfidence {
  return orders.length > 0 &&
    unresolvedCosts.length === 0 &&
    orders.every((order) => order.confidence === "REAL")
    ? "REAL"
    : "ESTIMATED";
}

function findingsFor(
  totals: MarginDreAmounts,
  unresolvedCosts: UnresolvedCostEvidence[],
): MarginFinding[] {
  const findings: MarginFinding[] = unresolvedCosts.map((cost) => ({
    type: "cost_unresolved",
    orderId: cost.orderId,
    sku: cost.sku,
    reason: cost.reason,
  }));
  if (toScaled(totals.contributionAmount) < 0n) {
    findings.push({
      type: "negative_contribution_margin",
      scope: "period",
      contributionAmount: totals.contributionAmount,
      contributionPercent: totals.contributionPercent,
    });
  }
  return findings;
}

function sumMoney(amounts: Money[]): Money {
  return toMoney(
    amounts.reduce((total, amount) => total + toScaled(amount), 0n),
    "period DRE amount",
  );
}

function costKey(orderId: string, sku: string): string {
  return JSON.stringify([orderId, sku]);
}

function compareCosts(
  left: UnresolvedCostEvidence,
  right: UnresolvedCostEvidence,
): number {
  return (
    left.orderId.localeCompare(right.orderId) ||
    left.sku.localeCompare(right.sku)
  );
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function cloneFilters(
  filters: NonNullable<MarginPeriodAnalysisInput["request"]["filters"]>,
): NonNullable<MarginPeriodAnalysisInput["request"]["filters"]> {
  return {
    ...(filters.channels === undefined
      ? {}
      : { channels: [...filters.channels] }),
    ...(filters.skus === undefined ? {} : { skus: [...filters.skus] }),
  };
}
