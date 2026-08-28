import { describe, expect, it } from "vitest";
import {
  normalizeProviderProduct,
  type NormalizedCatalogItem,
} from "../src/catalog-normalizer.js";
import type { ProviderProduct } from "../src/contracts.js";

const providerProduct: ProviderProduct = {
  externalProductId: "tray-product-17",
  reference: "SKU-017",
  ean: "7891234567890",
  price: "19.90",
  costPrice: "10.0000",
  promotionalPrice: "18.5000",
  stock: 8,
  status: "active",
  variations: [],
};

describe("normalizeProviderProduct", () => {
  it("preserves validated Tray facts and treats its reference as the only SKU candidate", () => {
    const normalized = normalizeProviderProduct(providerProduct);

    expect(normalized).toEqual<NormalizedCatalogItem>({
      externalProductId: "tray-product-17",
      externalSku: "SKU-017",
      ean: "7891234567890",
      price: "19.90",
      costPrice: "10.0000",
      promotionalPrice: "18.5000",
      status: "active",
      observedAt: expect.any(Date),
    });
  });

  it("returns an explicit missing SKU outcome when a provider reference is blank", () => {
    expect(
      normalizeProviderProduct({ ...providerProduct, reference: "   " }),
    ).toEqual({ status: "unresolved", reason: "missing_sku" });
  });
});
