import { describe, expect, it } from "vitest";
import {
  calculateContributionMargin,
  type ContributionMarginCalculationInput,
} from "../src/contribution-margin.js";
import type { Money, RevenueBasis } from "../src/contracts.js";

const money = (value: string): Money => value as Money;
const revenueBasis = (value: string): RevenueBasis => value as RevenueBasis;

const baseInput = (): ContributionMarginCalculationInput => ({
  snapshotId: "snapshot-1",
  officeId: "office-1",
  orderHeaderId: "order-1",
  financeRuleVersionId: "rule-version-1",
  calculationVersion: "contribution-margin-v1",
  revenueBasis: revenueBasis("seller_receivable"),
  revenueAmounts: {
    seller_receivable: { amount: money("100.0000"), confidence: "REAL" },
    buyer_paid_total: { amount: money("120.0000"), confidence: "REAL" },
  },
  cmv: { amount: money("30.0000"), confidence: "REAL" },
  sellerItemDiscounts: [
    { orderItemId: "item-1", amount: money("1.5000"), confidence: "REAL" },
  ],
  components: [
    {
      componentId: "tax-1",
      amount: money("8.0000"),
      currency: "BRL",
      componentType: "tax",
      payer: "seller",
      source: "marketplace.tax",
      rawCode: "tax",
      sourceReference: "tax-1",
      confidence: "REAL",
    },
    {
      componentId: "commission-1",
      amount: money("10.0000"),
      currency: "BRL",
      componentType: "marketplace_commission",
      payer: "seller",
      source: "marketplace.fees",
      rawCode: "commission",
      sourceReference: "commission-1",
      confidence: "REAL",
    },
    {
      componentId: "service-fee-1",
      amount: money("1.1234"),
      currency: "BRL",
      componentType: "service_fee",
      payer: "seller",
      source: "configured.fees",
      confidence: "ESTIMATED",
    },
    {
      componentId: "coupon-1",
      amount: money("3.0000"),
      currency: "BRL",
      componentType: "seller_coupon",
      payer: "seller",
      source: "marketplace.discounts",
      confidence: "REAL",
    },
    {
      componentId: "rebate-1",
      amount: money("2.0000"),
      currency: "BRL",
      componentType: "seller_rebate",
      payer: "seller",
      source: "marketplace.discounts",
      confidence: "REAL",
    },
    {
      componentId: "freight-1",
      amount: money("5.0000"),
      currency: "BRL",
      componentType: "seller_freight",
      payer: "seller",
      source: "marketplace.shipping",
      confidence: "REAL",
    },
    {
      componentId: "ads-1",
      amount: money("4.0000"),
      currency: "BRL",
      componentType: "ads_attribution",
      payer: "seller",
      source: "ads.attribution",
      confidence: "REAL",
    },
    {
      componentId: "other-1",
      amount: money("0.8766"),
      currency: "BRL",
      componentType: "other",
      payer: "seller",
      source: "marketplace.adjustments",
      confidence: "REAL",
    },
  ],
  evidenceMetadata: {
    calculatedAt: "2026-08-24T12:00:00.000Z",
    source: "golden-fixture",
  },
});

describe("deterministic contribution margin", () => {
  it("calculates the reviewed mixed DRE and retains audited evidence", () => {
    const snapshot = calculateContributionMargin(baseInput());

    expect(snapshot).toMatchObject({
      id: "snapshot-1",
      officeId: "office-1",
      orderHeaderId: "order-1",
      financeRuleVersionId: "rule-version-1",
      revenueBasis: "seller_receivable",
      cmv: "30.0000",
      taxes: "8.0000",
      marketplaceFees: "11.1234",
      sellerDiscounts: "6.5000",
      logistics: "5.0000",
      adsCost: "4.0000",
      otherCosts: "0.8766",
      contributionAmount: "34.5000",
      contributionPercent: "34.5000",
      confidence: "ESTIMATED",
      calculationVersion: "contribution-margin-v1",
      calculatedAt: "2026-08-24T12:00:00.000Z",
    });
    expect(snapshot.evidence).toMatchObject({
      revenue: { amount: "100.0000", confidence: "REAL" },
      cmv: { amount: "30.0000", confidence: "REAL" },
      components: expect.arrayContaining([
        expect.objectContaining({ componentId: "service-fee-1" }),
      ]),
      financeRuleVersionId: "rule-version-1",
      calculationVersion: "contribution-margin-v1",
    });
  });

  it("suppresses an estimated seller fee when real evidence has the same type and payer", () => {
    const input = baseInput();
    input.components = [
      {
        componentId: "payment-real",
        amount: money("5.0000"),
        currency: "BRL",
        componentType: "payment_fee",
        payer: "seller",
        source: "marketplace.fees",
        confidence: "REAL",
      },
      {
        componentId: "payment-estimated",
        amount: money("8.0000"),
        currency: "BRL",
        componentType: "payment_fee",
        payer: "seller",
        source: "configured.fees",
        confidence: "ESTIMATED",
      },
    ];
    input.sellerItemDiscounts = [];
    input.cmv = { amount: money("0.0000"), confidence: "REAL" };

    expect(calculateContributionMargin(input)).toMatchObject({
      marketplaceFees: "5.0000",
      contributionAmount: "95.0000",
      contributionPercent: "95.0000",
      confidence: "REAL",
    });
  });

  it("counts a repeated seller rebate only once and excludes marketplace subsidy from seller costs", () => {
    const input = baseInput();
    input.cmv = { amount: money("0.0000"), confidence: "REAL" };
    input.sellerItemDiscounts = [];
    input.components = [
      {
        componentId: "rebate-1",
        amount: money("7.0000"),
        currency: "BRL",
        componentType: "seller_rebate",
        payer: "seller",
        source: "marketplace.discounts",
        sourceReference: "rebate-1",
        confidence: "REAL",
      },
      {
        componentId: "rebate-1",
        amount: money("7.0000"),
        currency: "BRL",
        componentType: "seller_rebate",
        payer: "seller",
        source: "marketplace.discounts",
        sourceReference: "rebate-1",
        confidence: "REAL",
      },
      {
        componentId: "subsidy-1",
        amount: money("9.0000"),
        currency: "BRL",
        componentType: "marketplace_subsidy",
        payer: "marketplace",
        source: "marketplace.discounts",
        confidence: "REAL",
      },
    ];

    expect(calculateContributionMargin(input)).toMatchObject({
      sellerDiscounts: "7.0000",
      otherCosts: "0.0000",
      contributionAmount: "93.0000",
      contributionPercent: "93.0000",
      confidence: "REAL",
    });
  });

  it("rounds contribution percent half up at four decimal places without float precision loss", () => {
    const input = baseInput();
    input.revenueAmounts.seller_receivable = {
      amount: money("9007199254740.9922"),
      confidence: "REAL",
    };
    input.cmv = { amount: money("0.0000"), confidence: "REAL" };
    input.sellerItemDiscounts = [];
    input.components = [
      {
        componentId: "other-precision",
        amount: money("0.0001"),
        currency: "BRL",
        componentType: "other",
        payer: "seller",
        source: "precision.fixture",
        confidence: "REAL",
      },
    ];

    expect(calculateContributionMargin(input)).toMatchObject({
      contributionAmount: "9007199254740.9921",
      contributionPercent: "100.0000",
    });

    input.revenueAmounts.seller_receivable = {
      amount: money("200.0000"),
      confidence: "REAL",
    };
    input.components = [
      {
        componentId: "other-rounding",
        amount: money("0.0001"),
        currency: "BRL",
        componentType: "other",
        payer: "seller",
        source: "rounding.fixture",
        confidence: "REAL",
      },
    ];
    expect(calculateContributionMargin(input).contributionPercent).toBe(
      "100.0000",
    );
  });

  it("rejects a zero selected revenue basis rather than dividing by zero", () => {
    const input = baseInput();
    input.revenueAmounts.seller_receivable = {
      amount: money("0.0000"),
      confidence: "REAL",
    };

    expect(() => calculateContributionMargin(input)).toThrow(
      "selected revenue amount must not be zero",
    );
  });
});
