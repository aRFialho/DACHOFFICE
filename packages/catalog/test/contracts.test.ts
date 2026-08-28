import { describe, expect, it } from "vitest";
import { assertDecimalString, parseProviderProduct } from "../src/contracts.js";

const providerProductFixture = {
  id: "product-17",
  reference: "SKU-017",
  ean: "7891234567890",
  price: "19.90",
  cost_price: "10.0000",
  promotional_price: "18.5000",
  stock: 8,
  status: "active",
  variations: [
    {
      id: "variation-1",
      reference: "SKU-017-BLUE",
      ean: "7891234567891",
      price: "19.90",
      cost_price: "10.0000",
      stock: 3,
      status: "active",
    },
  ],
};

describe("catalog provider contracts", () => {
  it("parses a provider-shaped product without losing external facts", () => {
    expect(parseProviderProduct(providerProductFixture)).toEqual({
      externalProductId: "product-17",
      reference: "SKU-017",
      ean: "7891234567890",
      price: "19.90",
      costPrice: "10.0000",
      promotionalPrice: "18.5000",
      stock: 8,
      status: "active",
      variations: [
        {
          externalVariationId: "variation-1",
          reference: "SKU-017-BLUE",
          ean: "7891234567891",
          price: "19.90",
          costPrice: "10.0000",
          stock: 3,
          status: "active",
        },
      ],
    });
  });

  it("rejects non-string, exponent, non-finite, and over-precision decimals", () => {
    expect(() => assertDecimalString(19.9, "price")).toThrow(
      "price must be a decimal string",
    );
    expect(() => assertDecimalString("1e3", "price")).toThrow(
      "price must not use exponent notation",
    );
    expect(() => assertDecimalString("Infinity", "price")).toThrow(
      "price must be a finite decimal string",
    );
    expect(() => assertDecimalString("10.00001", "cost_price")).toThrow(
      "cost_price must have at most 4 decimal places",
    );
    expect(() => assertDecimalString("1234567890123456.0000", "price")).toThrow(
      "price must fit numeric(19,4)",
    );
  });

  it("rejects blank references and duplicate variation identities", () => {
    expect(() =>
      parseProviderProduct({ ...providerProductFixture, reference: "   " }),
    ).toThrow("reference must be a non-blank string");
    expect(() =>
      parseProviderProduct({
        ...providerProductFixture,
        variations: [
          providerProductFixture.variations[0],
          { ...providerProductFixture.variations[0] },
        ],
      }),
    ).toThrow("duplicate variation identity: variation-1");
  });
});
