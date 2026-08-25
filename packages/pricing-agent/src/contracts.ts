import {
  assertComponentConfidence,
  assertComponentPayer,
  assertFinancialComponentType,
  assertMoney,
  type ComponentConfidence,
  type ComponentPayer,
  type FinancialComponentType,
  type Money,
} from "@dachbyte-office/finance";

export type PricingCostSource = "supplier_table" | "canonical_cost";
export type PricingCost =
  | {
      status: "found";
      source: PricingCostSource;
      cost: Money;
      currency: string;
      effectiveAt: string;
      sourceReference: string;
    }
  | { status: "missing" };

export type PricingListing =
  | {
      status: "found";
      listingId: string;
      price: Money;
      currency: string;
      observedAt: string;
      sourceReference: string;
    }
  | { status: "missing" };

export interface PricingProductInput {
  productId: string;
  sku: string;
  name: string;
  supplierId?: string;
  cost: PricingCost;
  listing: PricingListing;
}

export interface PricingFeeAssumption {
  ruleId: string;
  componentType: FinancialComponentType;
  payer: ComponentPayer;
  feeMode: "percentage" | "fixed";
  value: Money;
  currency?: string;
  confidence: ComponentConfidence;
  validFrom: string;
  validTo?: string;
}

export interface PricingSimulationRequest {
  officeId: string;
  taskId: string;
  agentId: string;
  agentVersionId: string;
  channel: string;
  skus: string[];
  discountPercent: Money;
  periodStart: string;
  periodEnd: string;
}

export interface PricingSimulationInput {
  request: PricingSimulationRequest;
  products: PricingProductInput[];
  feeAssumptions: PricingFeeAssumption[];
}

export type PricingFinding =
  | { type: "cost_missing"; sku: string }
  | { type: "listing_missing"; sku: string }
  | { type: "currency_mismatch"; sku: string }
  | { type: "finance_assumptions_missing"; sku: string }
  | { type: "finance_assumptions_invalid"; sku: string }
  | { type: "fee_rate_unresolvable"; sku: string }
  | {
      type: "discount_below_break_even";
      sku: string;
      discountedPrice: Money;
      breakEvenMinimumPrice: Money;
    };

export type PricingActionStatus =
  | "prepared"
  | "below_break_even"
  | "unresolved";

export interface PricingSimulationLine {
  productId: string;
  sku: string;
  name: string;
  actionStatus: PricingActionStatus;
  confidence: ComponentConfidence;
  findings: PricingFinding[];
  currentPrice?: Money;
  discountedPrice?: Money;
  breakEvenMinimumPrice?: Money;
  maximumSafeDiscountPercent?: Money;
  sellerFixedFees?: Money;
  sellerVariableFeePercent?: Money;
  cost?: PricingCost & { status: "found" };
  listing?: PricingListing & { status: "found" };
  feeRuleIds: string[];
}

export interface PricingSimulationProvenance {
  officeId: string;
  taskId: string;
  agentId: string;
  agentVersionId: string;
  channel: string;
  periodStart: string;
  periodEnd: string;
  costSourceReferences: string[];
  listingSourceReferences: string[];
  feeRuleIds: string[];
}

export interface PricingSimulationReport {
  status: "completed" | "completed_with_findings";
  confidence: ComponentConfidence;
  lines: PricingSimulationLine[];
  provenance: PricingSimulationProvenance;
}

export function assertPricingSimulationInput(
  value: unknown,
): PricingSimulationInput {
  const input = record(value, "pricing simulation input");
  const request = assertRequest(input.request);
  const products = array(input.products, "products").map(assertProduct);
  if (products.length !== request.skus.length)
    throw new Error("products must match requested skus");
  const productSkus = products.map((product) => product.sku);
  if (!sameStrings(productSkus, request.skus))
    throw new Error("products must match requested skus");
  return {
    request,
    products,
    feeAssumptions: arrayAllowEmpty(input.feeAssumptions, "feeAssumptions").map(
      assertFeeAssumption,
    ),
  };
}

function assertRequest(value: unknown): PricingSimulationRequest {
  const request = record(value, "pricing simulation request");
  const periodStart = utcTimestamp(request.periodStart, "periodStart");
  const periodEnd = utcTimestamp(request.periodEnd, "periodEnd");
  if (Date.parse(periodEnd) < Date.parse(periodStart))
    throw new Error("periodEnd must not be before periodStart");
  const discountPercent = assertMoney(
    request.discountPercent,
    "discountPercent",
  );
  if (toScaled(discountPercent) < 0n || toScaled(discountPercent) >= 1_000_000n)
    throw new Error("discountPercent must be at least 0 and less than 100");
  return {
    officeId: nonBlank(request.officeId, "officeId"),
    taskId: nonBlank(request.taskId, "taskId"),
    agentId: nonBlank(request.agentId, "agentId"),
    agentVersionId: nonBlank(request.agentVersionId, "agentVersionId"),
    channel: normalizedChannel(request.channel, "channel"),
    skus: distinct(array(request.skus, "skus"), "skus", normalizedSku),
    discountPercent,
    periodStart,
    periodEnd,
  };
}

function assertProduct(value: unknown): PricingProductInput {
  const product = record(value, "product");
  return {
    productId: nonBlank(product.productId, "productId"),
    sku: normalizedSku(product.sku, "sku"),
    name: nonBlank(product.name, "name"),
    ...(product.supplierId === undefined || product.supplierId === null
      ? {}
      : { supplierId: nonBlank(product.supplierId, "supplierId") }),
    cost: assertCost(product.cost),
    listing: assertListing(product.listing),
  };
}

function assertCost(value: unknown): PricingCost {
  const cost = record(value, "cost");
  if (cost.status === "missing") return { status: "missing" };
  if (cost.status !== "found") throw new Error("cost.status is invalid");
  if (cost.source !== "supplier_table" && cost.source !== "canonical_cost")
    throw new Error("cost.source is invalid");
  return {
    status: "found",
    source: cost.source,
    cost: assertMoney(cost.cost, "cost.cost"),
    currency: currency(cost.currency, "cost.currency"),
    effectiveAt: utcTimestamp(cost.effectiveAt, "cost.effectiveAt"),
    sourceReference: nonBlank(cost.sourceReference, "cost.sourceReference"),
  };
}

function assertListing(value: unknown): PricingListing {
  const listing = record(value, "listing");
  if (listing.status === "missing") return { status: "missing" };
  if (listing.status !== "found") throw new Error("listing.status is invalid");
  return {
    status: "found",
    listingId: nonBlank(listing.listingId, "listing.listingId"),
    price: assertMoney(listing.price, "listing.price"),
    currency: currency(listing.currency, "listing.currency"),
    observedAt: utcTimestamp(listing.observedAt, "listing.observedAt"),
    sourceReference: nonBlank(
      listing.sourceReference,
      "listing.sourceReference",
    ),
  };
}

function assertFeeAssumption(value: unknown): PricingFeeAssumption {
  const fee = record(value, "fee assumption");
  if (fee.feeMode !== "percentage" && fee.feeMode !== "fixed")
    throw new Error("feeMode is invalid");
  const currencyValue =
    fee.currency === undefined || fee.currency === null
      ? undefined
      : currency(fee.currency, "fee.currency");
  if (
    (fee.feeMode === "fixed" && currencyValue === undefined) ||
    (fee.feeMode === "percentage" && currencyValue !== undefined)
  )
    throw new Error("fee currency is invalid for feeMode");
  return {
    ruleId: nonBlank(fee.ruleId, "fee.ruleId"),
    componentType: assertFinancialComponentType(fee.componentType),
    payer: assertComponentPayer(fee.payer),
    feeMode: fee.feeMode,
    value: assertMoney(fee.value, "fee.value"),
    ...(currencyValue === undefined ? {} : { currency: currencyValue }),
    confidence: assertComponentConfidence(fee.confidence),
    validFrom: utcTimestamp(fee.validFrom, "fee.validFrom"),
    ...(fee.validTo === undefined || fee.validTo === null
      ? {}
      : { validTo: utcTimestamp(fee.validTo, "fee.validTo") }),
  };
}

const strictUtc =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/;

function utcTimestamp(value: unknown, field: string): string {
  if (typeof value !== "string")
    throw new Error(`${field} must be a valid UTC timestamp`);
  const match = strictUtc.exec(value);
  if (match === null) throw new Error(`${field} must be a valid UTC timestamp`);
  const date = new Date(value);
  if (
    Number.isNaN(date.valueOf()) ||
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() + 1 !== Number(match[2]) ||
    date.getUTCDate() !== Number(match[3]) ||
    date.getUTCHours() !== Number(match[4]) ||
    date.getUTCMinutes() !== Number(match[5]) ||
    date.getUTCSeconds() !== Number(match[6])
  )
    throw new Error(`${field} must be a valid UTC timestamp`);
  return value;
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${field} must be an object`);
  return value as Record<string, unknown>;
}

function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0)
    throw new Error(`${field} must be a non-empty array`);
  return value;
}

function arrayAllowEmpty(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value;
}
function nonBlank(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "")
    throw new Error(`${field} must be non-blank`);
  return value;
}

function normalizedChannel(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9_-]*$/.test(value))
    throw new Error(`${field} must be normalized`);
  return value;
}

function normalizedSku(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^[A-Z0-9][A-Z0-9._-]*$/.test(value))
    throw new Error(`${field} must be normalized`);
  return value;
}

function currency(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value))
    throw new Error(`${field} must be an ISO currency`);
  return value;
}

function distinct(
  values: unknown[],
  field: string,
  parser: (value: unknown, field: string) => string,
): string[] {
  const parsed = values.map((value, index) =>
    parser(value, `${field}[${index}]`),
  );
  if (new Set(parsed).size !== parsed.length)
    throw new Error(`${field} must not contain duplicates`);
  return parsed;
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function toScaled(value: Money): bigint {
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace("-", "").split(".");
  const scaled = BigInt(`${whole}${fraction.padEnd(4, "0")}`);
  return negative ? -scaled : scaled;
}
