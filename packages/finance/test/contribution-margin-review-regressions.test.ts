import { describe, expect, it } from "vitest";
import {
  calculateContributionMargin,
  type ContributionMarginCalculationInput,
  type MarginComponent,
} from "../src/contribution-margin.js";
import type { Money, RevenueBasis } from "../src/contracts.js";

const money = (value: string): Money => value as Money;
const revenueBasis = (value: string): RevenueBasis => value as RevenueBasis;

function inputWith(
  components: MarginComponent[],
  options: { revenue?: Money; cmv?: Money } = {},
): ContributionMarginCalculationInput {
  return {
    snapshotId: "snapshot-review-1",
    officeId: "office-1",
    orderHeaderId: "order-1",
    financeRuleVersionId: "rule-version-1",
    calculationVersion: "contribution-margin-v1",
    revenueBasis: revenueBasis("seller_receivable"),
    revenueAmounts: {
      seller_receivable: {
        amount: options.revenue ?? money("100.0000"),
        confidence: "REAL",
      },
    },
    cmv: { amount: options.cmv ?? money("0.0000"), confidence: "REAL" },
    components,
    sellerItemDiscounts: [],
    evidenceMetadata: {
      calculatedAt: "2026-08-24T12:00:00.000Z",
      source: "review-regression-fixture",
    },
  };
}

describe("contribution margin review regressions", () => {
  it("deduplicates replayed provider rebate evidence despite distinct persisted component IDs", () => {
    const snapshot = calculateContributionMargin(
      inputWith([
        {
          componentId: "component-import-1",
          amount: money("7.0000"),
          currency: "BRL",
          componentType: "seller_rebate",
          payer: "seller",
          source: "marketplace.discounts",
          rawCode: "seller_rebate",
          sourceReference: "provider-rebate-17",
          confidence: "REAL",
        },
        {
          componentId: "component-import-retry-2",
          amount: money("7.0000"),
          currency: "BRL",
          componentType: "seller_rebate",
          payer: "seller",
          source: "marketplace.discounts",
          rawCode: "seller_rebate",
          sourceReference: "provider-rebate-17",
          confidence: "REAL",
        },
      ]),
    );

    expect(snapshot).toMatchObject({
      sellerDiscounts: "7.0000",
      contributionAmount: "93.0000",
      contributionPercent: "93.0000",
    });
    expect(snapshot.evidence.includedComponentIds).toEqual([
      "component-import-1",
    ]);
  });

  it("keeps distinct provider fee lines when their stable source references differ", () => {
    const snapshot = calculateContributionMargin(
      inputWith([
        {
          componentId: "fee-row-1",
          amount: money("2.0000"),
          currency: "BRL",
          componentType: "fixed_fee",
          payer: "seller",
          source: "marketplace.fees",
          rawCode: "fixed_fee",
          sourceReference: "provider-fee-line-1",
          confidence: "REAL",
        },
        {
          componentId: "fee-row-2",
          amount: money("3.0000"),
          currency: "BRL",
          componentType: "fixed_fee",
          payer: "seller",
          source: "marketplace.fees",
          rawCode: "fixed_fee",
          sourceReference: "provider-fee-line-2",
          confidence: "REAL",
        },
      ]),
    );

    expect(snapshot).toMatchObject({
      marketplaceFees: "5.0000",
      contributionAmount: "95.0000",
    });
  });

  it.each([
    {
      name: "rounds a negative exact half percent away from zero",
      revenue: money("200.0000"),
      cmv: money("400.0001"),
      component: money("-1.0000"),
      contributionAmount: "-199.0001",
      contributionPercent: "-99.5001",
    },
  ])(
    "$name",
    ({ revenue, cmv, component, contributionAmount, contributionPercent }) => {
      const snapshot = calculateContributionMargin(
        inputWith(
          [
            {
              componentId: "seller-refund-1",
              amount: component,
              currency: "BRL",
              componentType: "other",
              payer: "seller",
              source: "marketplace.adjustments",
              rawCode: "seller_refund",
              sourceReference: "refund-1",
              confidence: "REAL",
            },
          ],
          { revenue, cmv },
        ),
      );

      expect(snapshot).toMatchObject({
        otherCosts: "-1.0000",
        contributionAmount,
        contributionPercent,
      });
    },
  );
});
