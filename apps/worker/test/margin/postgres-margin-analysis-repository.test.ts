import { describe, expect, it } from "vitest";
import {
  PostgresMarginAnalysisRepository,
  type MarginAnalysisSqlClient,
  type MarginAnalysisSqlPool,
} from "../../src/margin/postgres-margin-analysis-repository.js";

type Query = { text: string; values?: readonly unknown[] };

class RecordingClient implements MarginAnalysisSqlClient {
  readonly queries: Query[] = [];

  constructor(
    private readonly responses: Record<string, Record<string, unknown>[]> = {},
  ) {}

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Row[] }> {
    this.queries.push({ text, ...(values === undefined ? {} : { values }) });
    const key = Object.keys(this.responses).find((candidate) =>
      text.includes(candidate),
    );
    return { rows: (key ? this.responses[key] : []) as unknown as Row[] };
  }

  release(): void {}
}

class RecordingPool implements MarginAnalysisSqlPool {
  readonly client: RecordingClient;

  constructor(responses: Record<string, Record<string, unknown>[]> = {}) {
    this.client = new RecordingClient(responses);
  }

  async connect(): Promise<MarginAnalysisSqlClient> {
    return this.client;
  }
}

const officeId = "11111111-1111-4111-8111-111111111111";
const taskId = "22222222-2222-4222-8222-222222222222";

const snapshotRow = {
  snapshot_id: "snapshot-2",
  order_id: "order-1",
  channel: "shopee",
  ordered_at: "2026-08-01T00:00:00.000Z",
  skus: ["SKU-1"],
  snapshot_calculated_at: "2026-08-02T00:00:00.000Z",
  finance_rule_version_id: "rule-1",
  calculation_version: "finance-v1",
  confidence: "REAL",
  revenue: "100.0000",
  cmv: "20.0000",
  taxes: "10.0000",
  marketplace_fees: "5.0000",
  seller_discounts: "0.0000",
  logistics: "2.0000",
  ads_cost: "1.0000",
  other_costs: "0.0000",
  contribution_amount: "62.0000",
  contribution_percent: "62.0000",
  evidence_json: {
    components: [{ sourceReference: "fee-1" }],
  },
};

const report = {
  status: "completed" as const,
  confidence: "REAL" as const,
  orders: [],
  totals: {
    revenue: "100.0000",
    cmv: "20.0000",
    taxes: "10.0000",
    marketplaceFees: "5.0000",
    sellerDiscounts: "0.0000",
    logistics: "2.0000",
    adsCost: "1.0000",
    otherCosts: "0.0000",
    contributionAmount: "62.0000",
    contributionPercent: "62.0000",
  },
  findings: [],
  evidence: { unresolvedCosts: [], consultations: [] },
  provenance: {
    officeId,
    taskId,
    agentId: "agent-1",
    agentVersionId: "agent-version-1",
    periodStart: "2026-08-01T00:00:00.000Z",
    periodEnd: "2026-08-31T23:59:59.999Z",
    snapshotIds: ["snapshot-2"],
    financeRuleVersionIds: ["rule-1"],
    calculationVersions: ["finance-v1"],
    snapshotCalculatedAts: ["2026-08-02T00:00:00.000Z"],
    evidenceReferences: ["snapshot:snapshot-2", "fee-1"],
  },
};

describe("PostgresMarginAnalysisRepository", () => {
  it("loads only the deterministic latest office-scoped snapshots for an inclusive filtered period", async () => {
    const pool = new RecordingPool({ "WITH latest_snapshots": [snapshotRow] });
    const repository = new PostgresMarginAnalysisRepository({ pool });

    await expect(
      repository.loadLatestSnapshots({
        officeId,
        periodStart: "2026-08-01T00:00:00.000Z",
        periodEnd: "2026-08-31T23:59:59.999Z",
        filters: { channels: ["shopee"], skus: ["SKU-1"] },
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        snapshotId: "snapshot-2",
        evidenceReferences: ["fee-1", "snapshot:snapshot-2"],
      }),
    ]);

    const query = pool.client.queries.find(({ text }) =>
      text.includes("WITH latest_snapshots"),
    );
    expect(query?.text).toContain("s.office_id = $1");
    expect(query?.text).toContain("h.ordered_at >= $2");
    expect(query?.text).toContain("h.ordered_at <= $3");
    expect(query?.text).toContain("DISTINCT ON (s.order_header_id)");
    expect(query?.text).toContain("s.calculated_at DESC, s.id DESC");
    expect(query?.text).not.toContain("shopee");
    expect(query?.values).toEqual([
      officeId,
      "2026-08-01T00:00:00.000Z",
      "2026-08-31T23:59:59.999Z",
      ["shopee"],
      ["SKU-1"],
    ]);
  });

  it("returns explicit unresolved costs for missing and ambiguous persisted product mappings", async () => {
    const pool = new RecordingPool({
      "WITH requested_costs": [
        {
          order_id: "order-1",
          sku: "SKU-1",
          product_id: null,
          cost_snapshot_id: null,
          cost_numeric: null,
          valid_at: null,
          source_reference: null,
        },
        {
          order_id: "order-1",
          sku: "SKU-2",
          product_id: "product-1",
          cost_snapshot_id: "cost-1",
          cost_numeric: "15.0000",
          valid_at: "2026-08-01T00:00:00.000Z",
          source_reference: "cost-evidence-1",
        },
        {
          order_id: "order-1",
          sku: "SKU-2",
          product_id: "product-2",
          cost_snapshot_id: "cost-2",
          cost_numeric: "16.0000",
          valid_at: "2026-08-01T00:00:00.000Z",
          source_reference: "cost-evidence-2",
        },
      ],
    });
    const repository = new PostgresMarginAnalysisRepository({ pool });

    await expect(
      repository.loadCanonicalCosts({
        officeId,
        orders: [{ orderId: "order-1", skus: ["SKU-1", "SKU-2"] }],
      }),
    ).resolves.toEqual([
      {
        status: "unresolved",
        orderId: "order-1",
        sku: "SKU-1",
        reason: "missing_cost",
        evidenceReferences: ["order-item:order-1:SKU-1"],
      },
      {
        status: "unresolved",
        orderId: "order-1",
        sku: "SKU-2",
        reason: "ambiguous_cost",
        evidenceReferences: [
          "cost-evidence-1",
          "cost-evidence-2",
          "cost:cost-1",
          "cost:cost-2",
        ],
      },
    ]);

    const query = pool.client.queries.find(({ text }) =>
      text.includes("WITH requested_costs"),
    );
    expect(query?.text).toContain("h.office_id = $1");
    expect(query?.text).toContain("pcs.office_id = h.office_id");
    expect(query?.text).toContain("pcs.valid_at <= h.ordered_at");
    expect(query?.text).toContain(
      "pcs.valid_at DESC, pcs.observed_at DESC, pcs.id DESC",
    );
    expect(query?.values).toEqual([officeId, ["order-1"], ["SKU-1", "SKU-2"]]);
  });

  it("preserves selected cost evidence and returns a fixed read outcome for invalid driver rows", async () => {
    const pool = new RecordingPool({
      "WITH requested_costs": [
        {
          order_id: "order-1",
          sku: "SKU-1",
          product_id: "product-1",
          cost_snapshot_id: "cost-1",
          cost_numeric: "15.0000",
          valid_at: "2026-08-01T00:00:00.000Z",
          source_reference: "cost-evidence-1",
        },
      ],
      "WITH latest_snapshots": [{ ...snapshotRow, confidence: "invalid" }],
    });
    const repository = new PostgresMarginAnalysisRepository({ pool });

    await expect(
      repository.loadCanonicalCosts({
        officeId,
        orders: [{ orderId: "order-1", skus: ["SKU-1"] }],
      }),
    ).resolves.toEqual([
      {
        status: "known",
        orderId: "order-1",
        sku: "SKU-1",
        productId: "product-1",
        cost: "15.0000",
        costVersionId: "cost-1",
        validAt: "2026-08-01T00:00:00.000Z",
        evidenceReferences: ["cost-evidence-1", "cost:cost-1"],
      },
    ]);
    await expect(
      repository.loadLatestSnapshots({
        officeId,
        periodStart: "2026-08-01T00:00:00.000Z",
        periodEnd: "2026-08-31T23:59:59.999Z",
      }),
    ).resolves.toEqual([]);
  });

  it("persists once, returns unchanged only for canonical replay facts, and fixes conflicting retries", async () => {
    const pool = new RecordingPool({
      "INSERT INTO margin_analysis_report": [],
      "SELECT id, agent_id": [
        {
          id: "report-1",
          agent_id: "agent-1",
          agent_version_id: "agent-version-1",
          period_start: "2026-08-01T00:00:00.000Z",
          period_end: "2026-08-31T23:59:59.999Z",
          filters_json: {},
          report_json: report,
          evidence_json: report.evidence,
          provenance_json: report.provenance,
          status: "completed",
          confidence: "REAL",
          revenue_numeric: "100.0000",
          cmv_numeric: "20.0000",
          taxes_numeric: "10.0000",
          marketplace_fees_numeric: "5.0000",
          seller_discounts_numeric: "0.0000",
          logistics_numeric: "2.0000",
          ads_cost_numeric: "1.0000",
          other_costs_numeric: "0.0000",
          contribution_amount_numeric: "62.0000",
          contribution_percent_numeric: "62.0000",
          calculated_at: "2026-08-25T00:00:00.000Z",
          idempotency_key: "margin:task-1",
        },
      ],
    });
    const repository = new PostgresMarginAnalysisRepository({ pool });
    const input = {
      idempotencyKey: "margin:task-1",
      calculatedAt: "2026-08-25T00:00:00.000Z",
      report: report as never,
    };

    await expect(repository.persistReport(input)).resolves.toEqual({
      status: "unchanged",
      reportId: "report-1",
    });
    await expect(
      repository.persistReport({
        ...input,
        report: { ...report, confidence: "ESTIMATED" } as never,
      }),
    ).resolves.toEqual({ status: "conflict", reportId: "report-1" });

    const insert = pool.client.queries.find(({ text }) =>
      text.includes("INSERT INTO margin_analysis_report"),
    );
    expect(insert?.text).toContain(
      "ON CONFLICT (office_id, task_id) DO NOTHING",
    );
    expect(insert?.text).not.toContain("margin:task-1");
    expect(insert?.values).toContain("margin:task-1");
  });
});
