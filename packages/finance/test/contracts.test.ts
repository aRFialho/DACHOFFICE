import { describe, expect, it } from "vitest";
import {
  assertFinancialComponent,
  assertMoney,
  assertRevenueBasis,
} from "../src/contracts.js";

describe("finance contracts", () => {
  it("accepts a decimal money string within numeric(19,4) precision", () => {
    expect(assertMoney("-123456789012345.6789", "amount")).toBe(
      "-123456789012345.6789",
    );
  });

  it("rejects numeric, exponent, non-finite, and over-scale money values", () => {
    expect(() => assertMoney(19.9, "amount")).toThrow(
      "amount must be a decimal string",
    );
    expect(() => assertMoney("1e3", "amount")).toThrow(
      "amount must not use exponent notation",
    );
    expect(() => assertMoney("NaN", "amount")).toThrow(
      "amount must be a finite decimal string",
    );
    expect(() => assertMoney("10.00001", "amount")).toThrow(
      "amount must have at most 4 decimal places",
    );
  });

  it("preserves a normalized financial component with its source provenance", () => {
    expect(
      assertFinancialComponent({
        amount: "12.5000",
        componentType: "marketplace_commission",
        payer: "marketplace",
        source: "mercado_livre.order_fees",
        rawCode: "sale_fee",
        confidence: "REAL",
        orderItemId: "order-item-1",
      }),
    ).toEqual({
      amount: "12.5000",
      componentType: "marketplace_commission",
      payer: "marketplace",
      source: "mercado_livre.order_fees",
      rawCode: "sale_fee",
      confidence: "REAL",
      orderItemId: "order-item-1",
    });
  });

  it("rejects financial components outside the approved taxonomy", () => {
    expect(() =>
      assertFinancialComponent({
        amount: "1.00",
        componentType: "unclassified_fee",
        payer: "seller",
        source: "channel",
        confidence: "REAL",
      }),
    ).toThrow("componentType must be a supported financial component type");
    expect(() =>
      assertFinancialComponent({
        amount: "1.00",
        componentType: "tax",
        payer: "affiliate",
        source: "channel",
        confidence: "REAL",
      }),
    ).toThrow("payer must be a supported component payer");
    expect(() =>
      assertFinancialComponent({
        amount: "1.00",
        componentType: "tax",
        payer: "seller",
        source: "channel",
        confidence: "INFERRED",
      }),
    ).toThrow("confidence must be REAL or ESTIMATED");
  });

  it("accepts a non-blank configured revenue basis", () => {
    expect(assertRevenueBasis("seller_receivable", "revenueBasis")).toBe(
      "seller_receivable",
    );
    expect(() => assertRevenueBasis("   ", "revenueBasis")).toThrow(
      "revenueBasis must be a non-blank string",
    );
  });
});
