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
export const CHANNEL_FEE_MODES = ["percentage", "fixed"] as const;

export type Money = string & { readonly __brand: "Money" };
export type RevenueBasis = string & { readonly __brand: "RevenueBasis" };
export type FinancialComponentType = (typeof FINANCIAL_COMPONENT_TYPES)[number];
export type ComponentPayer = (typeof COMPONENT_PAYERS)[number];
export type ComponentConfidence = (typeof COMPONENT_CONFIDENCES)[number];
export type ChannelFeeMode = (typeof CHANNEL_FEE_MODES)[number];
export type IdempotencyKey = string & { readonly __brand: "IdempotencyKey" };

export interface RawCodeMapping {
  componentType: FinancialComponentType;
  payer: ComponentPayer;
}

export interface FinanceRuleVersion {
  id: string;
  officeId: string;
  ruleSetId: string;
  version: number;
  rulesJson: { rawCodeMappings: Record<string, RawCodeMapping> };
}

export interface ChannelFeeRule {
  id: string;
  officeId: string;
  financeRuleVersionId: string;
  channel: string;
  componentType: FinancialComponentType;
  payer: ComponentPayer;
  feeMode: ChannelFeeMode;
  value: Money;
  currency?: string;
  source: string;
  rawCode?: string;
  confidence: "ESTIMATED";
  validFrom?: Date;
  validTo?: Date;
}

export interface ActualFinancialEvidence {
  amount: Money;
  currency: string;
  source: string;
  rawCode: string;
  sourceReference?: string;
  orderItemId?: string;
}

export interface FinancialComponent {
  amount: Money;
  componentType: FinancialComponentType;
  payer: ComponentPayer;
  source: string;
  rawCode?: string;
  confidence: ComponentConfidence;
  orderItemId?: string;
}

export interface ClassifiedFinancialComponent extends FinancialComponent {
  currency: string;
  sourceReference?: string;
}

export interface PersistFinancialComponentInput {
  officeId: string;
  orderHeaderId: string;
  idempotencyKey: IdempotencyKey;
  component: ClassifiedFinancialComponent;
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

  const [integerPart = "", fractionalPart] = value.replace("-", "").split(".");
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
    ...optionalNonBlankString(
      component.orderItemId,
      "orderItemId",
      "orderItemId",
    ),
  };
}

export function assertFinanceRuleVersion(value: unknown): FinanceRuleVersion {
  const version = assertRecord(value, "finance rule version");
  const rulesJson = assertRecord(version.rulesJson, "rulesJson");
  const rawCodeMappings = assertRecord(
    rulesJson.rawCodeMappings,
    "rulesJson.rawCodeMappings",
  );
  const parsedMappings: Record<string, RawCodeMapping> = {};
  for (const [rawCode, mapping] of Object.entries(rawCodeMappings)) {
    assertNonBlankString(rawCode, "rulesJson.rawCodeMappings key");
    const parsedMapping = assertRecord(
      mapping,
      `rulesJson.rawCodeMappings.${rawCode}`,
    );
    parsedMappings[rawCode] = {
      componentType: assertFinancialComponentType(parsedMapping.componentType),
      payer: assertComponentPayer(parsedMapping.payer),
    };
  }
  return {
    id: assertNonBlankString(version.id, "id"),
    officeId: assertNonBlankString(version.officeId, "officeId"),
    ruleSetId: assertNonBlankString(version.ruleSetId, "ruleSetId"),
    version: assertPositiveInteger(version.version, "version"),
    rulesJson: { rawCodeMappings: parsedMappings },
  };
}

export function assertChannelFeeRule(value: unknown): ChannelFeeRule {
  const rule = assertRecord(value, "channel fee rule");
  const feeMode = assertMember(
    rule.feeMode,
    CHANNEL_FEE_MODES,
    "feeMode must be percentage or fixed",
  );
  const currency = optionalCurrency(rule.currency, "currency");
  const validFrom = optionalDate(rule.validFrom, "validFrom");
  const validTo = optionalDate(rule.validTo, "validTo");
  if (feeMode === "percentage" && currency !== undefined)
    throw new Error("percentage fee rules must not have currency");
  if (feeMode === "fixed" && currency === undefined)
    throw new Error("fixed fee rules must have currency");
  if (validFrom !== undefined && validTo !== undefined && validTo < validFrom)
    throw new Error("validTo must not be before validFrom");
  if (rule.confidence !== "ESTIMATED")
    throw new Error("configured fee rules must be ESTIMATED");
  return {
    id: assertNonBlankString(rule.id, "id"),
    officeId: assertNonBlankString(rule.officeId, "officeId"),
    financeRuleVersionId: assertNonBlankString(
      rule.financeRuleVersionId,
      "financeRuleVersionId",
    ),
    channel: assertNonBlankString(rule.channel, "channel"),
    componentType: assertFinancialComponentType(rule.componentType),
    payer: assertComponentPayer(rule.payer),
    feeMode,
    value: assertMoney(rule.value, "value"),
    ...optionalField(currency, "currency"),
    source: assertNonBlankString(rule.source, "source"),
    ...optionalField(
      optionalNonBlankStringValue(rule.rawCode, "rawCode"),
      "rawCode",
    ),
    confidence: "ESTIMATED",
    ...optionalField(validFrom, "validFrom"),
    ...optionalField(validTo, "validTo"),
  };
}
export function assertActualFinancialEvidence(
  value: unknown,
): ActualFinancialEvidence {
  const evidence = assertRecord(value, "actual financial evidence");
  return {
    amount: assertMoney(evidence.amount, "amount"),
    currency: assertCurrency(evidence.currency, "currency"),
    source: assertNonBlankString(evidence.source, "source"),
    rawCode: assertNonBlankString(evidence.rawCode, "rawCode"),
    ...optionalField(
      optionalNonBlankStringValue(evidence.sourceReference, "sourceReference"),
      "sourceReference",
    ),
    ...optionalField(
      optionalNonBlankStringValue(evidence.orderItemId, "orderItemId"),
      "orderItemId",
    ),
  };
}

export function assertClassifiedFinancialComponent(
  value: unknown,
): ClassifiedFinancialComponent {
  const component = assertRecord(value, "classified financial component");
  return {
    ...assertFinancialComponent(component),
    currency: assertCurrency(component.currency, "currency"),
    ...optionalField(
      optionalNonBlankStringValue(component.sourceReference, "sourceReference"),
      "sourceReference",
    ),
  };
}

export function assertPersistFinancialComponentInput(
  value: unknown,
): PersistFinancialComponentInput {
  const input = assertRecord(value, "persist financial component input");
  return {
    officeId: assertNonBlankString(input.officeId, "officeId"),
    orderHeaderId: assertNonBlankString(input.orderHeaderId, "orderHeaderId"),
    idempotencyKey: assertIdempotencyKey(input.idempotencyKey),
    component: assertClassifiedFinancialComponent(input.component),
  };
}

export function assertIdempotencyKey(value: unknown): IdempotencyKey {
  const idempotencyKey = assertNonBlankString(value, "idempotencyKey");
  if (idempotencyKey.length > 200)
    throw new Error("idempotencyKey must be at most 200 characters");
  return idempotencyKey as IdempotencyKey;
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

function assertPositiveInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0)
    throw new Error(`${field} must be a positive integer`);
  return value;
}

function assertCurrency(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value))
    throw new Error(`${field} must be a three-letter uppercase currency`);
  return value;
}

function optionalCurrency(value: unknown, field: string): string | undefined {
  return value === undefined || value === null
    ? undefined
    : assertCurrency(value, field);
}

function optionalDate(value: unknown, field: string): Date | undefined {
  if (value === undefined || value === null) return undefined;
  if (!(value instanceof Date) || Number.isNaN(value.valueOf()))
    throw new Error(`${field} must be a valid Date`);
  return value;
}
function optionalNonBlankStringValue(
  value: unknown,
  field: string,
): string | undefined {
  return value === undefined || value === null
    ? undefined
    : assertNonBlankString(value, field);
}

function optionalField<K extends string, T>(
  value: T | undefined,
  key: K,
): { [P in K]?: T } {
  return value === undefined ? {} : ({ [key]: value } as { [P in K]?: T });
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
