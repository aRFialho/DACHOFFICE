import { describe, expect, it } from "vitest";
import {
  classifyActualFinancialEvidence,
  selectEstimatedFeeRules,
} from "../src/classification.js";
import type {
  ActualFinancialEvidence,
  ChannelFeeRule,
  ClassifiedFinancialComponent,
  FinanceRuleVersion,
} from "../src/contracts.js";

const ruleVersion: FinanceRuleVersion = {
  id: "rule-version-2",
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
};

const actualEvidence: ActualFinancialEvidence = {
  amount: "12.5000" as ActualFinancialEvidence["amount"],
  currency: "BRL",
  source: "marketplace.order_fees",
  rawCode: "sale_fee",
  sourceReference: "fee-17",
};

const feeRules: readonly ChannelFeeRule[] = [
  {
    id: "fee-rule-commission",
    officeId: "office-1",
    financeRuleVersionId: "rule-version-2",
    channel: "marketplace",
    componentType: "marketplace_commission",
    payer: "marketplace",
    feeMode: "percentage",
    value: "0.16" as ChannelFeeRule["value"],
    source: "configured.marketplace",
    confidence: "ESTIMATED",
    validFrom: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "fee-rule-fixed",
    officeId: "office-1",
    financeRuleVersionId: "rule-version-2",
    channel: "marketplace",
    componentType: "fixed_fee",
    payer: "seller",
    feeMode: "fixed",
    value: "6.00" as ChannelFeeRule["value"],
    currency: "BRL",
    source: "configured.marketplace",
    confidence: "ESTIMATED",
    validFrom: new Date("2026-01-01T00:00:00.000Z"),
    validTo: new Date("2026-12-31T23:59:59.999Z"),
  },
];

describe("versioned financial component classification", () => {
  it("maps known actual raw codes into REAL typed components without changing provenance", () => {
    expect(
      classifyActualFinancialEvidence(ruleVersion, actualEvidence),
    ).toEqual({
      amount: "12.5000",
      currency: "BRL",
      componentType: "marketplace_commission",
      payer: "marketplace",
      source: "marketplace.order_fees",
      rawCode: "sale_fee",
      sourceReference: "fee-17",
      confidence: "REAL",
    });
  });

  it("keeps an unknown raw code as REAL other/unknown evidence", () => {
    expect(
      classifyActualFinancialEvidence(ruleVersion, {
        ...actualEvidence,
        rawCode: "provider_new_fee",
      }),
    ).toEqual({
      amount: "12.5000",
      currency: "BRL",
      componentType: "other",
      payer: "unknown",
      source: "marketplace.order_fees",
      rawCode: "provider_new_fee",
      sourceReference: "fee-17",
      confidence: "REAL",
    });
  });

  it("selects only applicable estimated rules and suppresses a real equivalent", () => {
    const actualComponents: readonly ClassifiedFinancialComponent[] = [
      classifyActualFinancialEvidence(ruleVersion, actualEvidence),
    ];

    expect(
      selectEstimatedFeeRules({
        ruleVersion,
        feeRules,
        channel: "marketplace",
        occurredAt: new Date("2026-06-01T00:00:00.000Z"),
        actualComponents,
      }).map((rule) => rule.id),
    ).toEqual(["fee-rule-fixed"]);
  });

  it("excludes a rule outside its validity interval or from a different channel", () => {
    expect(
      selectEstimatedFeeRules({
        ruleVersion,
        feeRules: [
          ...feeRules.map((rule) => ({
            ...rule,
            validTo: new Date("2026-12-31T23:59:59.999Z"),
          })),
          { ...feeRules[1]!, channel: "another-channel", id: "wrong-channel" },
        ],
        channel: "marketplace",
        occurredAt: new Date("2027-01-01T00:00:00.000Z"),
        actualComponents: [],
      }),
    ).toEqual([]);
  });
});
