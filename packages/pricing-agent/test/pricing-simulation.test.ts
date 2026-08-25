import { describe, expect, it } from "vitest";
import { simulatePricing } from "../src/pricing-simulation.js";
import type { PricingSimulationInput } from "../src/contracts.js";
import type { Money } from "@dachbyte-office/finance";

const money = (value: string) => value as Money;

const input = (
  overrides: Partial<PricingSimulationInput> = {},
): PricingSimulationInput => ({
  request: {
    officeId: "office-1",
    taskId: "task-1",
    agentId: "agent-1",
    agentVersionId: "agent-version-1",
    channel: "tray",
    skus: ["SKU-1"],
    discountPercent: money("10.0000"),
    periodStart: "2026-08-01T00:00:00.000Z",
    periodEnd: "2026-08-31T23:59:59.999Z",
  },
  products: [
    {
      productId: "product-1",
      sku: "SKU-1",
      name: "Mesa",
      supplierId: "supplier-1",
      cost: {
        status: "found",
        source: "supplier_table",
        cost: money("50.0000"),
        currency: "BRL",
        effectiveAt: "2026-08-01T00:00:00.000Z",
        sourceReference: "supplier-row-1",
      },
      listing: {
        status: "found",
        listingId: "listing-1",
        price: money("100.0000"),
        currency: "BRL",
        observedAt: "2026-08-01T00:00:00.000Z",
        sourceReference: "listing:listing-1",
      },
    },
  ],
  feeAssumptions: [
    {
      ruleId: "fee-percent-1",
      componentType: "marketplace_commission",
      payer: "seller",
      feeMode: "percentage",
      value: money("10.0000"),
      confidence: "ESTIMATED",
      validFrom: "2026-01-01T00:00:00.000Z",
    },
    {
      ruleId: "fee-fixed-1",
      componentType: "fixed_fee",
      payer: "seller",
      feeMode: "fixed",
      value: money("5.0000"),
      currency: "BRL",
      confidence: "ESTIMATED",
      validFrom: "2026-01-01T00:00:00.000Z",
    },
  ],
  ...overrides,
});

describe("simulatePricing", () => {
  it("calculates a conservative break-even minimum and discount scenario with bigint decimal arithmetic", () => {
    const result = simulatePricing(input());

    expect(result).toMatchObject({
      status: "completed",
      confidence: "ESTIMATED",
      lines: [
        expect.objectContaining({
          sku: "SKU-1",
          currentPrice: "100.0000",
          discountedPrice: "90.0000",
          breakEvenMinimumPrice: "61.1112",
          maximumSafeDiscountPercent: "38.8888",
          actionStatus: "prepared",
          confidence: "ESTIMATED",
        }),
      ],
    });
    expect(result.provenance).toMatchObject({
      costSourceReferences: ["supplier-row-1"],
      feeRuleIds: ["fee-fixed-1", "fee-percent-1"],
    });
  });

  it("marks a requested discount below break-even as not preparable without guessing", () => {
    const result = simulatePricing(
      input({
        request: { ...input().request, discountPercent: money("50.0000") },
      }),
    );

    expect(result.lines[0]).toMatchObject({
      discountedPrice: "50.0000",
      breakEvenMinimumPrice: "61.1112",
      actionStatus: "below_break_even",
    });
  });

  it("reports missing finance assumptions explicitly instead of treating them as zero", () => {
    const result = simulatePricing(input({ feeAssumptions: [] }));

    expect(result).toMatchObject({
      status: "completed_with_findings",
      confidence: "ESTIMATED",
      lines: [
        expect.objectContaining({
          actionStatus: "unresolved",
          findings: [expect.objectContaining({ type: "finance_assumptions_missing" })],
        }),
      ],
    });
  });

  it("rejects a seller variable rate at or above 100 percent as unresolved", () => {
    const result = simulatePricing(
      input({
        feeAssumptions: [
          {
            ruleId: "fee-100",
            componentType: "marketplace_commission",
            payer: "seller",
            feeMode: "percentage",
            value: money("100.0000"),
            confidence: "ESTIMATED",
            validFrom: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    );

    expect(result.lines[0]).toMatchObject({
      actionStatus: "unresolved",
      findings: [expect.objectContaining({ type: "fee_rate_unresolvable" })],
    });
  });

  it("does not fabricate a cost when the SKU has no mapped supplier or canonical cost", () => {
    const result = simulatePricing(
      input({
        products: [
          {
            ...input().products[0]!,
            cost: { status: "missing" },
          },
        ],
      }),
    );

    expect(result.lines[0]).toMatchObject({
      actionStatus: "unresolved",
      findings: [expect.objectContaining({ type: "cost_missing" })],
    });
  });
});
