export interface ProviderVariation {
  externalVariationId: string;
  reference: string;
  ean?: string;
  price: string;
  costPrice: string;
  promotionalPrice?: string;
  stock: number;
  status: string;
}

export interface ProviderProduct {
  externalProductId: string;
  reference: string;
  ean?: string;
  price: string;
  costPrice: string;
  promotionalPrice?: string;
  stock: number;
  status: string;
  variations: ProviderVariation[];
}

export interface CatalogPage {
  products: ProviderProduct[];
  nextCursor?: string;
}

export interface VariationPage {
  variations: ProviderVariation[];
  nextCursor?: string;
}

export interface CatalogProvider {
  listProducts(input: { cursor?: string }): Promise<CatalogPage>;
  getProduct(input: { externalProductId: string }): Promise<ProviderProduct>;
  listVariations(input: { cursor?: string }): Promise<VariationPage>;
}

export type MappingResolution =
  | { status: "mapped"; productId: string }
  | {
      status: "unresolved";
      reason: "missing_sku" | "ambiguous_sku" | "mapping_not_found";
    };

const DECIMAL_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const MAX_DECIMAL_PLACES = 4;

type UnknownRecord = Record<string, unknown>;

export function assertDecimalString(value: unknown, field: string): string {
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

  const fractionalPart = value.split(".")[1];
  const decimalPointIndex = value.indexOf(".");
  const integerPart =
    decimalPointIndex === -1 ? value : value.slice(0, decimalPointIndex);
  if (integerPart.replace("-", "").length > 15) {
    throw new Error(`${field} must fit numeric(19,4)`);
  }
  if (
    fractionalPart !== undefined &&
    fractionalPart.length > MAX_DECIMAL_PLACES
  ) {
    throw new Error(`${field} must have at most 4 decimal places`);
  }

  return value;
}

export function parseProviderProduct(value: unknown): ProviderProduct {
  const product = assertRecord(value, "product");
  const variations = assertArray(product.variations, "variations");
  const parsedVariations = variations.map((variation, index) =>
    parseProviderVariation(variation, `variations[${index}]`),
  );
  const variationIds = new Set<string>();

  for (const variation of parsedVariations) {
    if (variationIds.has(variation.externalVariationId)) {
      throw new Error(
        `duplicate variation identity: ${variation.externalVariationId}`,
      );
    }
    variationIds.add(variation.externalVariationId);
  }

  return {
    externalProductId: assertNonBlankString(product.id, "id"),
    reference: assertNonBlankString(product.reference, "reference"),
    ...optionalString(product.ean, "ean"),
    price: assertDecimalString(product.price, "price"),
    costPrice: assertDecimalString(product.cost_price, "cost_price"),
    ...optionalDecimalString(product.promotional_price, "promotional_price"),
    stock: assertFiniteNumber(product.stock, "stock"),
    status: assertNonBlankString(product.status, "status"),
    variations: parsedVariations,
  };
}

function parseProviderVariation(
  value: unknown,
  field: string,
): ProviderVariation {
  const variation = assertRecord(value, field);

  return {
    externalVariationId: assertNonBlankString(variation.id, `${field}.id`),
    reference: assertNonBlankString(variation.reference, `${field}.reference`),
    ...optionalString(variation.ean, `${field}.ean`),
    price: assertDecimalString(variation.price, `${field}.price`),
    costPrice: assertDecimalString(variation.cost_price, `${field}.cost_price`),
    ...optionalDecimalString(
      variation.promotional_price,
      `${field}.promotional_price`,
    ),
    stock: assertFiniteNumber(variation.stock, `${field}.stock`),
    status: assertNonBlankString(variation.status, `${field}.status`),
  };
}

function assertRecord(value: unknown, field: string): UnknownRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }

  return value as UnknownRecord;
}

function assertArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array`);
  }

  return value;
}

function assertNonBlankString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} must be a non-blank string`);
  }

  return value;
}

function optionalString(value: unknown, field: string): { ean?: string } {
  if (value === undefined || value === null) {
    return {};
  }

  return { ean: assertNonBlankString(value, field) };
}

function optionalDecimalString(
  value: unknown,
  field: string,
): { promotionalPrice?: string } {
  if (value === undefined || value === null || value === "") {
    return {};
  }

  return { promotionalPrice: assertDecimalString(value, field) };
}

function assertFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number`);
  }

  return value;
}
