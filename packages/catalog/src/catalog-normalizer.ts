import {
  assertDecimalString,
  type MappingResolution,
  type ProviderProduct,
  type ProviderVariation,
} from "./contracts.js";

export type NormalizedCatalogItem = {
  externalProductId: string;
  externalVariationId?: string;
  externalSku?: string;
  ean?: string;
  price: string;
  costPrice: string;
  promotionalPrice?: string;
  status: string;
  observedAt: Date;
};

export function normalizeProviderProduct(
  product: ProviderProduct,
  observedAt = new Date(),
): NormalizedCatalogItem | MappingResolution {
  const item = normalizedProduct(product, observedAt);
  return item.externalSku === undefined
    ? { status: "unresolved", reason: "missing_sku" }
    : item;
}

export function normalizeProviderProductForPersistence(
  product: ProviderProduct,
  observedAt: Date,
): NormalizedCatalogItem {
  return normalizedProduct(product, observedAt);
}

export function normalizeProviderVariationsForPersistence(
  product: ProviderProduct,
  observedAt: Date,
): NormalizedCatalogItem[] {
  return product.variations.map((variation) =>
    normalizedVariation(product.externalProductId, variation, observedAt),
  );
}
export function normalizeProviderVariations(
  product: ProviderProduct,
  observedAt: Date,
): (NormalizedCatalogItem | MappingResolution)[] {
  return product.variations.map((variation) => {
    const item = normalizedVariation(
      product.externalProductId,
      variation,
      observedAt,
    );
    return item.externalSku === undefined
      ? { status: "unresolved", reason: "missing_sku" }
      : item;
  });
}

function normalizedProduct(
  product: ProviderProduct,
  observedAt: Date,
): NormalizedCatalogItem {
  return normalizedItem(
    product.externalProductId,
    undefined,
    product.reference,
    product.ean,
    product.price,
    product.costPrice,
    product.promotionalPrice,
    product.status,
    observedAt,
  );
}

function normalizedVariation(
  externalProductId: string,
  variation: ProviderVariation,
  observedAt: Date,
): NormalizedCatalogItem {
  return normalizedItem(
    externalProductId,
    variation.externalVariationId,
    variation.reference,
    variation.ean,
    variation.price,
    variation.costPrice,
    variation.promotionalPrice,
    variation.status,
    observedAt,
  );
}

function normalizedItem(
  externalProductId: string,
  externalVariationId: string | undefined,
  reference: string,
  ean: string | undefined,
  price: string,
  costPrice: string,
  promotionalPrice: string | undefined,
  status: string,
  observedAt: Date,
): NormalizedCatalogItem {
  assertNonBlankString(externalProductId, "externalProductId");
  if (externalVariationId !== undefined) {
    assertNonBlankString(externalVariationId, "externalVariationId");
  }
  if (ean !== undefined) assertNonBlankString(ean, "ean");
  assertNonBlankString(status, "status");
  if (!(observedAt instanceof Date) || !Number.isFinite(observedAt.getTime())) {
    throw new Error("catalog_observed_at_invalid");
  }

  const item: NormalizedCatalogItem = {
    externalProductId,
    ...(externalVariationId === undefined ? {} : { externalVariationId }),
    ...(reference.trim() === "" ? {} : { externalSku: reference }),
    ...(ean === undefined ? {} : { ean }),
    price: assertDecimalString(price, "price"),
    costPrice: assertDecimalString(costPrice, "costPrice"),
    ...(promotionalPrice === undefined
      ? {}
      : {
          promotionalPrice: assertDecimalString(
            promotionalPrice,
            "promotionalPrice",
          ),
        }),
    status,
    observedAt,
  };
  return item;
}

function assertNonBlankString(value: string, field: string): void {
  if (value.trim() === "") throw new Error(`${field} must be non-blank`);
}
