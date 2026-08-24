import { describe, expect, it } from "vitest";
import * as classification from "../src/classification.js";
import {
  calculateContributionMargin,
  type ContributionMarginCalculationInput,
  type MarginComponent,
} from "../src/contribution-margin.js";
import type {
  ChannelFeeRule,
  ClassifiedFinancialComponent,
  FinanceRuleVersion,
  Money,
  RevenueBasis,
} from "../src/contracts.js";

const money = (value: string): Money => value as Money;
const revenueBasis = (value: string): RevenueBasis => value as RevenueBasis;

const ruleVersion: FinanceRuleVersion = {
  id: "rule-version-estimated",
  officeId: "office-1",
  ruleSetId: "rule-set-1",
  version: 3,
  rulesJson: { rawCodeMappings: {} },
};

const occurredAt = new Date("2026-06-01T00:00:00.000Z");

const feeRules: readonly ChannelFeeRule[] = [
  {
    id: "fee-rule-percentage",
    officeId: "office-1",
    financeRuleVersionId: ruleVersion.id,
    channel: "marketplace",
    componentType: "marketplace_commission",
    payer: "seller",
    feeMode: "percentage",
    value: money("2.3750"),
    source: "configured.marketplace",
    rawCode: "configured_commission",
    confidence: "ESTIMATED",
    validFrom: occurredAt,
    validTo: occurredAt,
  },
  {
    id: "fee-rule-fixed",
    officeId: "office-1",
    financeRuleVersionId: ruleVersion.id,
    channel: "marketplace",
    componentType: "fixed_fee",
    payer: "seller",
    feeMode: "fixed",
    value: money("6.00"),
    currency: "BRL",
    source: "configured.marketplace",
    rawCode: "configured_fixed",
    confidence: "ESTIMATED",
    validFrom: occurredAt,
    validTo: occurredAt,
  },
];

type MaterializeEstimatedFeeComponents = (input: {
  ruleVersion: FinanceRuleVersion;
  feeRules: readonly ChannelFeeRule[];
  channel: string;
  occurredAt: Date;
  selectedRevenue: { amount: Money; currency: string };
  actualComponents: readonly ClassifiedFinancialComponent[];
}) => readonly MarginComponent[];

const materializeEstimatedFeeComponents = (
  classification as unknown as {
    materializeEstimatedFeeComponents?: MaterializeEstimatedFeeComponents;
  }
).materializeEstimatedFeeComponents;

describe("configured estimated fee materialization", () => {
  it("materializes fixed and fractional percentage rules at inclusive validity boundaries, suppresses real equivalents, and downgrades the calculated margin confidence", () => {
    expect(materializeEstimatedFeeComponents).toBeTypeOf("function");
    if (materializeEstimatedFeeComponents === undefined) return;

    const selectedRevenue = { amount: money("123.4567"), currency: "BRL" };
    const materialized = materializeEstimatedFeeComponents({
      ruleVersion,
      feeRules,
      channel: "marketplace",
      occurredAt,
      selectedRevenue,
      actualComponents: [],
    });

    expect(materialized).toEqual([
      expect.objectContaining({
        componentId: "estimated-fee-rule:fee-rule-percentage",
        amount: "2.9321",
        currency: "BRL",
        componentType: "marketplace_commission",
        payer: "seller",
        confidence: "ESTIMATED",
      }),
      expect.objectContaining({
        componentId: "estimated-fee-rule:fee-rule-fixed",
        amount: "6.0000",
        currency: "BRL",
        componentType: "fixed_fee",
        payer: "seller",
        confidence: "ESTIMATED",
      }),
    ]);

    expect(
      materializeEstimatedFeeComponents({
        ruleVersion,
        feeRules,
        channel: "marketplace",
        occurredAt: new Date("2026-06-01T00:00:00.001Z"),
        selectedRevenue,
        actualComponents: [],
      }),
    ).toEqual([]);

    const realFixedFee: MarginComponent = {
      componentId: "provider-fixed-fee",
      amount: money("6.0000"),
      currency: "BRL",
      componentType: "fixed_fee",
      payer: "seller",
      source: "marketplace.fees",
      rawCode: "provider_fixed",
      confidence: "REAL",
    };
    const unsuppressedEstimates = materializeEstimatedFeeComponents({
      ruleVersion,
      feeRules,
      channel: "marketplace",
      occurredAt,
      selectedRevenue,
      actualComponents: [realFixedFee],
    });
    expect(
      unsuppressedEstimates.map((component) => component.componentId),
    ).toEqual(["estimated-fee-rule:fee-rule-percentage"]);

    const input: ContributionMarginCalculationInput = {
      snapshotId: "snapshot-estimated-rules",
      officeId: "office-1",
      orderHeaderId: "order-1",
      financeRuleVersionId: ruleVersion.id,
      calculationVersion: "contribution-margin-v1",
      revenueBasis: revenueBasis("seller_receivable"),
      revenueAmounts: {
        seller_receivable: {
          amount: selectedRevenue.amount,
          confidence: "REAL",
        },
      },
      cmv: { amount: money("0.0000"), confidence: "REAL" },
      components: [realFixedFee, ...unsuppressedEstimates],
      sellerItemDiscounts: [],
      evidenceMetadata: {
        calculatedAt: "2026-08-24T12:00:00.000Z",
        source: "estimated-rule-golden-fixture",
      },
    };

    expect(calculateContributionMargin(input)).toMatchObject({
      marketplaceFees: "8.9321",
      contributionAmount: "114.5246",
      confidence: "ESTIMATED",
      evidence: {
        components: expect.arrayContaining([
          expect.objectContaining({
            componentId: "estimated-fee-rule:fee-rule-percentage",
            confidence: "ESTIMATED",
          }),
        ]),
      },
    });
  });
});
