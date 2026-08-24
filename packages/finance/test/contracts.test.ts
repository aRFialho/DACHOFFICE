import { describe, expect, it } from "vitest";
import {
  assertActualFinancialEvidence,
  assertChannelFeeRule,
  assertFinanceRuleVersion,
  assertIdempotencyKey,
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

  it("accepts a versioned raw-code mapping and direct financial evidence", () => {
    expect(
      assertFinanceRuleVersion({
        id: "rule-version-1",
        officeId: "office-1",
        ruleSetId: "rule-set-1",
        version: 2,
        rulesJson: {
          rawCodeMappings: {
            sale_fee: {
              componentType: "marketplace_commission",
              payer: "marketplace",
            },
          },
        },
      }),
    ).toMatchObject({
      id: "rule-version-1",
      version: 2,
      rulesJson: {
        rawCodeMappings: {
          sale_fee: {
            componentType: "marketplace_commission",
            payer: "marketplace",
          },
        },
      },
    });
    expect(
      assertActualFinancialEvidence({
        amount: "12.5000",
        currency: "BRL",
        source: "marketplace.order_fees",
        rawCode: "sale_fee",
        sourceReference: "fee-17",
      }),
    ).toMatchObject({ rawCode: "sale_fee", sourceReference: "fee-17" });
  });

  it("rejects an idempotency key outside the persisted component boundary", () => {
    expect(assertIdempotencyKey("component:order-1:fee-17")).toBe(
      "component:order-1:fee-17",
    );
    expect(() => assertIdempotencyKey("   ")).toThrow(
      "idempotencyKey must be a non-blank string",
    );
    expect(() => assertIdempotencyKey("x".repeat(201))).toThrow(
      "idempotencyKey must be at most 200 characters",
    );
  });
  it("accepts only estimated channel fee rules with valid matching fields", () => {
    expect(
      assertChannelFeeRule({
        id: "fee-1",
        officeId: "office-1",
        financeRuleVersionId: "rule-version-1",
        channel: "marketplace",
        componentType: "fixed_fee",
        payer: "seller",
        feeMode: "fixed",
        value: "6.00",
        currency: "BRL",
        source: "configured.marketplace",
        confidence: "ESTIMATED",
        validFrom: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ).toMatchObject({ feeMode: "fixed", confidence: "ESTIMATED" });
    expect(() =>
      assertChannelFeeRule({
        id: "fee-1",
        officeId: "office-1",
        financeRuleVersionId: "rule-version-1",
        channel: "marketplace",
        componentType: "fixed_fee",
        payer: "seller",
        feeMode: "fixed",
        value: "6.00",
        currency: "BRL",
        source: "configured.marketplace",
        confidence: "REAL",
      }),
    ).toThrow("configured fee rules must be ESTIMATED");
  });
});
