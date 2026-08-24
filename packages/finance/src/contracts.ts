export const FINANCIAL_COMPONENT_TYPES = [
  "marketplace_commission",
  "fixed_fee",
  "service_fee",
  "seller_coupon",
  "marketplace_coupon",
  "seller_rebate",
  "marketplace_subsidy",
  "buyer_freight",
  "seller_freight",
  "tax",
  "ads_attribution",
  "payment_fee",
  "other",
] as const;

export const COMPONENT_PAYERS = [
  "seller",
  "marketplace",
  "buyer",
  "unknown",
] as const;

export const COMPONENT_CONFIDENCES = ["REAL", "ESTIMATED"] as const;

export type Money = string & { readonly __brand: "Money" };
export type RevenueBasis = string & { readonly __brand: "RevenueBasis" };
export type FinancialComponentType = (typeof FINANCIAL_COMPONENT_TYPES)[number];
export type ComponentPayer = (typeof COMPONENT_PAYERS)[number];
export type ComponentConfidence = (typeof COMPONENT_CONFIDENCES)[number];

export interface FinancialComponent {
  amount: Money;
  componentType: FinancialComponentType;
  payer: ComponentPayer;
  source: string;
  rawCode?: string;
  confidence: ComponentConfidence;
  orderItemId?: string;
}

const DECIMAL_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const MAX_DECIMAL_PLACES = 4;
const MAX_INTEGER_DIGITS = 15;

type UnknownRecord = Record<string, unknown>;

export function assertMoney(value: unknown, field: string): Money {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a decimal string`);
  }

  if (/e/i.test(value)) {
    throw new Error(`${field} must not use exponent notation`);
  }

  if (value === "Infinity" || value === "-Infinity" || value === "NaN") {
    throw new Error(`${field} must be a finite decimal string`);
  }

  if (!DECIMAL_PATTERN.test(value)) {
    throw new Error(`${field} must be a decimal string`);
  }

  const [integerPart, fractionalPart] = value.replace("-", "").split(".");
  if (integerPart.length > MAX_INTEGER_DIGITS) {
    throw new Error(`${field} must fit numeric(19,4)`);
  }
  if (
    fractionalPart !== undefined &&
    fractionalPart.length > MAX_DECIMAL_PLACES
  ) {
    throw new Error(`${field} must have at most 4 decimal places`);
  }

  return value as Money;
}

export function assertRevenueBasis(
  value: unknown,
  field: string,
): RevenueBasis {
  return assertNonBlankString(value, field) as RevenueBasis;
}

export function assertFinancialComponent(value: unknown): FinancialComponent {
  const component = assertRecord(value, "financial component");

  return {
    amount: assertMoney(component.amount, "amount"),
    componentType: assertFinancialComponentType(component.componentType),
    payer: assertComponentPayer(component.payer),
    source: assertNonBlankString(component.source, "source"),
    ...optionalNonBlankString(component.rawCode, "rawCode", "rawCode"),
    confidence: assertComponentConfidence(component.confidence),
    ...optionalNonBlankString(component.orderItemId, "orderItemId", "orderItemId"),
  };
}

export function assertFinancialComponentType(
  value: unknown,
): FinancialComponentType {
  return assertMember(
    value,
    FINANCIAL_COMPONENT_TYPES,
    "componentType must be a supported financial component type",
  );
}

export function assertComponentPayer(value: unknown): ComponentPayer {
  return assertMember(
    value,
    COMPONENT_PAYERS,
    "payer must be a supported component payer",
  );
}

export function assertComponentConfidence(value: unknown): ComponentConfidence {
  return assertMember(
    value,
    COMPONENT_CONFIDENCES,
    "confidence must be REAL or ESTIMATED",
  );
}

function assertRecord(value: unknown, field: string): UnknownRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }

  return value as UnknownRecord;
}

function assertNonBlankString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} must be a non-blank string`);
  }

  return value;
}

function optionalNonBlankString(
  value: unknown,
  field: string,
  key: "rawCode" | "orderItemId",
): { rawCode?: string; orderItemId?: string } {
  if (value === undefined || value === null) {
    return {};
  }

  return { [key]: assertNonBlankString(value, field) };
}

function assertMember<T extends string>(
  value: unknown,
  members: readonly T[],
  message: string,
): T {
  if (typeof value !== "string" || !members.includes(value as T)) {
    throw new Error(message);
  }

  return value as T;
}
