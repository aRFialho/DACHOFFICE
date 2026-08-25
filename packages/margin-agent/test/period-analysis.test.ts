import { describe, expect, it } from "vitest";
import { analyzeMarginPeriod } from "../src/period-analysis.js";
import type {
  MarginDreAmounts,
  MarginPeriodAnalysisInput,
  PersistedOrderMargin,
} from "../src/contracts.js";

type OrderOverrides = Partial<
  Omit<PersistedOrderMargin, keyof MarginDreAmounts>
> &
  Partial<Record<keyof MarginDreAmounts, string>>;

const money = (value: string) =>
  value as import("@dachbyte-office/finance").Money;

const order = (overrides: OrderOverrides = {}): PersistedOrderMargin =>
  ({
    orderId: "order-1",
    channel: "shopee",
    orderedAt: "2026-08-10T12:00:00.000Z",
    skus: ["SKU-1"],
    snapshotId: "snapshot-1",
    snapshotCalculatedAt: "2026-08-10T12:05:00.000Z",
    financeRuleVersionId: "rule-1",
    calculationVersion: "contribution-margin-v1",
    revenue: "100.0000",
    cmv: "25.0000",
    taxes: "10.0000",
    marketplaceFees: "5.0000",
    sellerDiscounts: "2.0000",
    logistics: "3.0000",
    adsCost: "1.0000",
    otherCosts: "4.0000",
    contributionAmount: "50.0000",
    contributionPercent: "50.0000",
    confidence: "REAL",
    evidenceReferences: ["margin-snapshot:snapshot-1"],
    ...overrides,
  }) as PersistedOrderMargin;

const input = (
  overrides: Partial<MarginPeriodAnalysisInput> = {},
): MarginPeriodAnalysisInput => ({
  request: {
    officeId: "office-1",
    taskId: "task-1",
    periodStart: "2026-08-10T00:00:00.000Z",
    periodEnd: "2026-08-10T23:59:59.999Z",
    filters: { channels: ["shopee"] },
    agentId: "margin-agent-1",
    agentVersionId: "margin-agent-version-1",
  },
  orders: [order()],
  costs: [
    {
      status: "known",
      orderId: "order-1",
      sku: "SKU-1",
      productId: "product-1",
      cost: money("25.0000"),
      costVersionId: "cost-version-1",
      validAt: "2026-08-10T00:00:00.000Z",
      evidenceReferences: ["cost:cost-version-1"],
    },
  ],
  consultations: [],
  ...overrides,
});

describe("analyzeMarginPeriod", () => {
  it("aggregates an all-REAL multi-order DRE with immutable provenance", () => {
    const result = analyzeMarginPeriod(
      input({
        orders: [
          order(),
          order({
            orderId: "order-2",
            skus: ["SKU-2"],
            snapshotId: "snapshot-2",
            revenue: "200.0000",
            cmv: "50.0000",
            taxes: "20.0000",
            marketplaceFees: "10.0000",
            sellerDiscounts: "4.0000",
            logistics: "6.0000",
            adsCost: "2.0000",
            otherCosts: "8.0000",
            contributionAmount: "100.0000",
            contributionPercent: "50.0000",
          }),
        ],
        costs: [
          input().costs[0]!,
          {
            status: "known",
            orderId: "order-2",
            sku: "SKU-2",
            productId: "product-2",
            cost: money("50.0000"),
            costVersionId: "cost-version-2",
            validAt: "2026-08-10T00:00:00.000Z",
            evidenceReferences: ["cost:cost-version-2"],
          },
        ],
      }),
    );

    expect(result).toMatchObject({
      status: "completed",
      confidence: "REAL",
      totals: {
        revenue: "300.0000",
        cmv: "75.0000",
        taxes: "30.0000",
        marketplaceFees: "15.0000",
        sellerDiscounts: "6.0000",
        logistics: "9.0000",
        adsCost: "3.0000",
        otherCosts: "12.0000",
        contributionAmount: "150.0000",
        contributionPercent: "50.0000",
      },
      provenance: {
        agentId: "margin-agent-1",
        agentVersionId: "margin-agent-version-1",
        snapshotIds: ["snapshot-1", "snapshot-2"],
      },
    });
    expect(result.orders.map((item) => item.snapshotId)).toEqual([
      "snapshot-1",
      "snapshot-2",
    ]);
  });

  it("labels a mixed period ESTIMATED", () => {
    const result = analyzeMarginPeriod(
      input({
        orders: [
          order(),
          order({
            orderId: "order-2",
            snapshotId: "snapshot-2",
            confidence: "ESTIMATED",
          }),
        ],
      }),
    );

    expect(result.confidence).toBe("ESTIMATED");
  });

  it("uses inclusive UTC bounds and normalized channel/SKU filters", () => {
    const result = analyzeMarginPeriod(
      input({
        request: {
          ...input().request,
          filters: { channels: ["shopee"], skus: ["SKU-1"] },
        },
        orders: [
          order({ orderedAt: "2026-08-10T00:00:00.000Z" }),
          order({
            orderId: "order-2",
            snapshotId: "snapshot-2",
            orderedAt: "2026-08-10T23:59:59.999Z",
          }),
          order({
            orderId: "order-3",
            snapshotId: "snapshot-3",
            orderedAt: "2026-08-11T00:00:00.000Z",
          }),
          order({
            orderId: "order-4",
            snapshotId: "snapshot-4",
            channel: "mercado_livre",
          }),
          order({
            orderId: "order-5",
            snapshotId: "snapshot-5",
            skus: ["SKU-2"],
          }),
        ],
      }),
    );

    expect(result.orders.map((item) => item.orderId)).toEqual([
      "order-1",
      "order-2",
    ]);
  });

  it("returns an explicit no-data outcome", () => {
    expect(analyzeMarginPeriod(input({ orders: [] }))).toMatchObject({
      status: "no_margin_snapshots",
      orders: [],
      findings: [],
    });
  });

  it("retains unresolved cost evidence without guessing CMV", () => {
    const result = analyzeMarginPeriod(
      input({
        costs: [
          {
            status: "unresolved",
            orderId: "order-1",
            sku: "SKU-1",
            reason: "missing_cost",
            evidenceReferences: ["catalog:sku-1"],
          },
        ],
      }),
    );

    expect(result).toMatchObject({
      confidence: "ESTIMATED",
      evidence: { unresolvedCosts: [{ orderId: "order-1", sku: "SKU-1" }] },
      findings: [
        expect.objectContaining({
          type: "cost_unresolved",
          orderId: "order-1",
        }),
      ],
      totals: { cmv: "25.0000" },
    });
  });

  it("emits a deterministic non-prescriptive negative contribution finding", () => {
    const result = analyzeMarginPeriod(
      input({
        orders: [
          order({
            contributionAmount: "-0.0001",
            contributionPercent: "-0.0001",
          }),
        ],
      }),
    );

    expect(result.findings).toEqual([
      {
        type: "negative_contribution_margin",
        scope: "period",
        contributionAmount: "-0.0001",
        contributionPercent: "-0.0001",
      },
    ]);
  });

  it("uses bigint fixed-scale arithmetic for high-precision and negative percentage rounding", () => {
    const highPrecision = analyzeMarginPeriod(
      input({
        orders: [
          order({
            revenue: "9007199254740.9922",
            cmv: "0.0000",
            taxes: "0.0000",
            marketplaceFees: "0.0000",
            sellerDiscounts: "0.0000",
            logistics: "0.0000",
            adsCost: "0.0000",
            otherCosts: "0.0001",
            contributionAmount: "9007199254740.9921",
            contributionPercent: "100.0000",
          }),
        ],
      }),
    );
    const negative = analyzeMarginPeriod(
      input({
        orders: [
          order({
            revenue: "200.0000",
            cmv: "200.0001",
            taxes: "0.0000",
            marketplaceFees: "0.0000",
            sellerDiscounts: "0.0000",
            logistics: "0.0000",
            adsCost: "0.0000",
            otherCosts: "0.0000",
            contributionAmount: "-0.0001",
            contributionPercent: "-0.0001",
          }),
        ],
      }),
    );

    expect(highPrecision.totals.contributionPercent).toBe("100.0000");
    expect(negative.totals.contributionPercent).toBe("-0.0001");
  });
});
it("rejects a repeated immutable snapshot before it can inflate the DRE", () => {
  expect(() =>
    analyzeMarginPeriod(
      input({
        orders: [
          order(),
          order({
            orderId: "order-2",
            snapshotId: "snapshot-1",
          }),
        ],
      }),
    ),
  ).toThrow("duplicate margin snapshot ID: snapshot-1");
});
