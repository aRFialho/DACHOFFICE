import {
  assertComponentConfidence,
  assertMoney,
  type ComponentConfidence,
  type Money,
} from "@dachbyte-office/finance";

export interface MarginPeriodFilters {
  channels?: string[];
  skus?: string[];
}

export interface MarginPeriodRequest {
  officeId: string;
  taskId: string;
  periodStart: string;
  periodEnd: string;
  filters?: MarginPeriodFilters;
  agentId: string;
  agentVersionId: string;
}

export interface MarginDreAmounts {
  revenue: Money;
  cmv: Money;
  taxes: Money;
  marketplaceFees: Money;
  sellerDiscounts: Money;
  logistics: Money;
  adsCost: Money;
  otherCosts: Money;
  contributionAmount: Money;
  contributionPercent: Money;
}

export interface PersistedOrderMargin extends MarginDreAmounts {
  orderId: string;
  channel: string;
  orderedAt: string;
  skus: string[];
  snapshotId: string;
  snapshotCalculatedAt: string;
  financeRuleVersionId: string;
  calculationVersion: string;
  confidence: ComponentConfidence;
  evidenceReferences: string[];
}

export interface KnownCanonicalCost {
  status: "known";
  orderId: string;
  sku: string;
  productId: string;
  cost: Money;
  costVersionId: string;
  validAt: string;
  evidenceReferences: string[];
}

export interface UnresolvedCanonicalCost {
  status: "unresolved";
  orderId: string;
  sku: string;
  reason: "missing_cost" | "ambiguous_cost";
  evidenceReferences: string[];
}

export type CanonicalCostLookup = KnownCanonicalCost | UnresolvedCanonicalCost;

export interface FinanceConsultationRecord {
  consultationId: string;
  status: "requested";
  reason: "missing_classification" | "ambiguous_classification";
  requestedAt: string;
  evidenceReferences: string[];
}

export interface MarginPeriodAnalysisInput {
  request: MarginPeriodRequest;
  orders: PersistedOrderMargin[];
  costs: CanonicalCostLookup[];
  consultations?: FinanceConsultationRecord[];
}

export interface MarginOrderReport extends PersistedOrderMargin {
  costs: CanonicalCostLookup[];
}

export interface UnresolvedCostEvidence {
  orderId: string;
  sku: string;
  reason: UnresolvedCanonicalCost["reason"];
  evidenceReferences: string[];
}

export interface MarginReportEvidence {
  unresolvedCosts: UnresolvedCostEvidence[];
  consultations: FinanceConsultationRecord[];
}

export interface MarginReportProvenance {
  officeId: string;
  taskId: string;
  agentId: string;
  agentVersionId: string;
  periodStart: string;
  periodEnd: string;
  filters?: MarginPeriodFilters;
  snapshotIds: string[];
  financeRuleVersionIds: string[];
  calculationVersions: string[];
  snapshotCalculatedAts: string[];
  evidenceReferences: string[];
}

export type MarginFinding =
  | {
      type: "negative_contribution_margin";
      scope: "period";
      contributionAmount: Money;
      contributionPercent: Money;
    }
  | {
      type: "cost_unresolved";
      orderId: string;
      sku: string;
      reason: UnresolvedCanonicalCost["reason"];
    };

export interface MarginPeriodReport {
  status: "completed" | "no_margin_snapshots";
  confidence: ComponentConfidence;
  orders: MarginOrderReport[];
  totals: MarginDreAmounts;
  findings: MarginFinding[];
  evidence: MarginReportEvidence;
  provenance: MarginReportProvenance;
}

export function assertMarginPeriodAnalysisInput(
  value: unknown,
): MarginPeriodAnalysisInput {
  const input = assertRecord(value, "margin period analysis input");
  return {
    request: assertMarginPeriodRequest(input.request),
    orders: assertArray(input.orders, "orders").map(assertPersistedOrderMargin),
    costs: assertArray(input.costs, "costs").map(assertCanonicalCostLookup),
    ...(input.consultations === undefined || input.consultations === null
      ? {}
      : {
          consultations: assertArray(input.consultations, "consultations").map(
            assertFinanceConsultationRecord,
          ),
        }),
  };
}

export function assertMarginPeriodRequest(value: unknown): MarginPeriodRequest {
  const request = assertRecord(value, "margin period request");
  const periodStart = assertUtcTimestamp(request.periodStart, "periodStart");
  const periodEnd = assertUtcTimestamp(request.periodEnd, "periodEnd");
  if (Date.parse(periodEnd) < Date.parse(periodStart))
    throw new Error("periodEnd must not be before periodStart");
  return {
    officeId: assertNonBlankString(request.officeId, "officeId"),
    taskId: assertNonBlankString(request.taskId, "taskId"),
    periodStart,
    periodEnd,
    ...(request.filters === undefined || request.filters === null
      ? {}
      : { filters: assertMarginPeriodFilters(request.filters) }),
    agentId: assertNonBlankString(request.agentId, "agentId"),
    agentVersionId: assertNonBlankString(
      request.agentVersionId,
      "agentVersionId",
    ),
  };
}

export function assertPersistedOrderMargin(
  value: unknown,
): PersistedOrderMargin {
  const order = assertRecord(value, "persisted order margin");
  return {
    orderId: assertNonBlankString(order.orderId, "orderId"),
    channel: assertNormalizedChannel(order.channel, "channel"),
    orderedAt: assertUtcTimestamp(order.orderedAt, "orderedAt"),
    skus: assertNonEmptyDistinctStrings(
      order.skus,
      "skus",
      assertNormalizedSku,
    ),
    snapshotId: assertNonBlankString(order.snapshotId, "snapshotId"),
    snapshotCalculatedAt: assertUtcTimestamp(
      order.snapshotCalculatedAt,
      "snapshotCalculatedAt",
    ),
    financeRuleVersionId: assertNonBlankString(
      order.financeRuleVersionId,
      "financeRuleVersionId",
    ),
    calculationVersion: assertNonBlankString(
      order.calculationVersion,
      "calculationVersion",
    ),
    revenue: assertMoney(order.revenue, "revenue"),
    cmv: assertMoney(order.cmv, "cmv"),
    taxes: assertMoney(order.taxes, "taxes"),
    marketplaceFees: assertMoney(order.marketplaceFees, "marketplaceFees"),
    sellerDiscounts: assertMoney(order.sellerDiscounts, "sellerDiscounts"),
    logistics: assertMoney(order.logistics, "logistics"),
    adsCost: assertMoney(order.adsCost, "adsCost"),
    otherCosts: assertMoney(order.otherCosts, "otherCosts"),
    contributionAmount: assertMoney(
      order.contributionAmount,
      "contributionAmount",
    ),
    contributionPercent: assertMoney(
      order.contributionPercent,
      "contributionPercent",
    ),
    confidence: assertComponentConfidence(order.confidence),
    evidenceReferences: assertDistinctReferences(
      order.evidenceReferences,
      "evidenceReferences",
    ),
  };
}

export function assertCanonicalCostLookup(value: unknown): CanonicalCostLookup {
  const cost = assertRecord(value, "canonical cost lookup");
  const common = {
    orderId: assertNonBlankString(cost.orderId, "cost.orderId"),
    sku: assertNormalizedSku(cost.sku, "cost.sku"),
    evidenceReferences: assertDistinctReferences(
      cost.evidenceReferences,
      "cost.evidenceReferences",
    ),
  };
  if (cost.status === "known") {
    return {
      status: "known",
      ...common,
      productId: assertNonBlankString(cost.productId, "cost.productId"),
      cost: assertMoney(cost.cost, "cost.cost"),
      costVersionId: assertNonBlankString(
        cost.costVersionId,
        "cost.costVersionId",
      ),
      validAt: assertUtcTimestamp(cost.validAt, "cost.validAt"),
    };
  }
  if (cost.status === "unresolved") {
    return {
      status: "unresolved",
      ...common,
      reason: assertCostReason(cost.reason),
    };
  }
  throw new Error("cost.status must be known or unresolved");
}

export function assertFinanceConsultationRecord(
  value: unknown,
): FinanceConsultationRecord {
  const record = assertRecord(value, "finance consultation record");
  if (record.status !== "requested")
    throw new Error("finance consultation status must be requested");
  return {
    consultationId: assertNonBlankString(
      record.consultationId,
      "consultationId",
    ),
    status: "requested",
    reason: assertConsultationReason(record.reason),
    requestedAt: assertUtcTimestamp(record.requestedAt, "requestedAt"),
    evidenceReferences: assertDistinctReferences(
      record.evidenceReferences,
      "consultation.evidenceReferences",
    ),
  };
}

function assertMarginPeriodFilters(value: unknown): MarginPeriodFilters {
  const filters = assertRecord(value, "filters");
  const channels =
    filters.channels === undefined || filters.channels === null
      ? undefined
      : assertNonEmptyDistinctStrings(
          filters.channels,
          "filters.channels",
          assertNormalizedChannel,
        );
  const skus =
    filters.skus === undefined || filters.skus === null
      ? undefined
      : assertNonEmptyDistinctStrings(
          filters.skus,
          "filters.skus",
          assertNormalizedSku,
        );
  if (channels === undefined && skus === undefined)
    throw new Error("filters must include channels or skus");
  return {
    ...(channels === undefined ? {} : { channels }),
    ...(skus === undefined ? {} : { skus }),
  };
}

function assertCostReason(value: unknown): UnresolvedCanonicalCost["reason"] {
  if (value === "missing_cost" || value === "ambiguous_cost") return value;
  throw new Error("cost.reason must be missing_cost or ambiguous_cost");
}

function assertConsultationReason(
  value: unknown,
): FinanceConsultationRecord["reason"] {
  if (
    value === "missing_classification" ||
    value === "ambiguous_classification"
  )
    return value;
  throw new Error(
    "consultation.reason must be missing_classification or ambiguous_classification",
  );
}

function assertUtcTimestamp(value: unknown, field: string): string {
  if (
    typeof value !== "string" ||
    !value.endsWith("Z") ||
    Number.isNaN(Date.parse(value))
  )
    throw new Error(`${field} must be a valid UTC timestamp`);
  return value;
}

function assertNormalizedChannel(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9_-]*$/.test(value))
    throw new Error(`${field} must be a normalized channel`);
  return value;
}

function assertNormalizedSku(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^[A-Z0-9][A-Z0-9._-]*$/.test(value))
    throw new Error(`${field} must be a normalized SKU`);
  return value;
}

function assertDistinctReferences(value: unknown, field: string): string[] {
  return assertNonEmptyDistinctStrings(value, field, assertNonBlankString);
}

function assertNonEmptyDistinctStrings(
  value: unknown,
  field: string,
  assertItem: (value: unknown, field: string) => string,
): string[] {
  if (!Array.isArray(value) || value.length === 0)
    throw new Error(`${field} must be a non-empty array`);
  const values = value.map((item, index) =>
    assertItem(item, `${field}[${index}]`),
  );
  if (new Set(values).size !== values.length)
    throw new Error(`${field} must not contain duplicates`);
  return values;
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
