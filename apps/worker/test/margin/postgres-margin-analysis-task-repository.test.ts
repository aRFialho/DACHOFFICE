import { describe, expect, it } from "vitest";
import { MarginAnalysisTaskHandler } from "../../src/margin/margin-analysis-task-handler.js";
import { PostgresMarginAnalysisTaskRepository } from "../../src/margin/postgres-margin-analysis-task-repository.js";

const job = {
  outboxId: "outbox-1",
  idempotencyKey: "task.queued:task-1:1",
  taskId: "task-1",
};

const order = {
  orderId: "order-1",
  channel: "shopee",
  orderedAt: "2026-08-10T12:00:00.000Z",
  skus: ["SKU-1"],
  snapshotId: "snapshot-1",
  snapshotCalculatedAt: "2026-08-10T12:05:00.000Z",
  financeRuleVersionId: "rule-1",
  calculationVersion: "finance-v1",
  confidence: "REAL",
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
  evidenceReferences: ["snapshot:snapshot-1"],
};

type Query = { text: string; values?: readonly unknown[] };

class RecordingPool {
  readonly queries: Query[] = [];
  taskFound = true;
  existingReport: Record<string, unknown> | undefined;
  readonly client = {
    query: async (text: string, values?: readonly unknown[]) => {
      this.queries.push({ text, ...(values === undefined ? {} : { values }) });
      if (text.includes("SELECT t.office_id")) {
        return {
          rows: this.taskFound
            ? [{ office_id: "office-1", agent_id: "agent-1", status: "queued" }]
            : [],
        };
      }
      if (text.includes("SELECT context_key")) {
        return {
          rows: [
            {
              context_key: "periodStart",
              value_text: "2026-08-01T00:00:00.000Z",
            },
            {
              context_key: "periodEnd",
              value_text: "2026-08-31T23:59:59.999Z",
            },
            { context_key: "agentVersionId", value_text: "version-1" },
          ],
        };
      }
      if (text.includes("SELECT a.lifecycle_status")) {
        return {
          rows: [
            { lifecycle_status: "active", active_version_id: "version-1" },
          ],
        };
      }
      if (text.includes("SELECT tool_code")) {
        return {
          rows: [
            { tool_code: "finance.getRules", access_level: "read" },
            { tool_code: "finance.getMargin", access_level: "read" },
            { tool_code: "products.getCost", access_level: "read" },
          ],
        };
      }
      if (text.includes("INSERT INTO worker_job_delivery")) {
        return { rows: [{ idempotency_key: job.idempotencyKey }] };
      }
      if (text.includes("INSERT INTO margin_analysis_report")) {
        return {
          rows: this.existingReport === undefined ? [{ id: "report-1" }] : [],
        };
      }
      if (text.includes("SELECT id, agent_id")) {
        return {
          rows: this.existingReport === undefined ? [] : [this.existingReport],
        };
      }
      if (text.includes("UPDATE task")) return { rows: [{ id: job.taskId }] };
      return { rows: [] };
    },
    release: () => undefined,
  };

  async connect() {
    return this.client;
  }

  async query(text: string, values?: readonly unknown[]) {
    this.queries.push({ text, ...(values === undefined ? {} : { values }) });
    if (text.includes("SELECT 1 FROM task"))
      return { rowCount: 1, rows: [{ "?column?": 1 }] };
    return { rowCount: 0, rows: [] };
  }
}

const facts = (calls: string[]) => ({
  async loadLatestSnapshots(input: { officeId: string }) {
    calls.push(`snapshots:${input.officeId}`);
    return [order] as never;
  },
  async loadCanonicalCosts(input: {
    officeId: string;
    orders: readonly { orderId: string; skus: readonly string[] }[];
  }) {
    calls.push(`costs:${input.officeId}`);
    return input.orders.flatMap((item) =>
      item.skus.map((sku) => ({
        status: "known" as const,
        orderId: item.orderId,
        sku,
        productId: "product-1",
        cost: "20.0000",
        costVersionId: "cost-1",
        validAt: "2026-08-01T00:00:00.000Z",
        evidenceReferences: ["cost:cost-1"],
      })),
    ) as never;
  },
});

describe("PostgresMarginAnalysisTaskRepository", () => {
  it("locks the server-owned task/agent, checks all current READ grants, and completes one report transaction", async () => {
    const pool = new RecordingPool();
    const calls: string[] = [];
    const handler = new MarginAnalysisTaskHandler({
      repository: new PostgresMarginAnalysisTaskRepository(pool as never),
      facts: facts(calls),
      now: () => "2026-08-25T12:00:00.000Z",
    });

    await expect(handler.run(job)).resolves.toBe(true);

    expect(calls).toEqual(["snapshots:office-1", "costs:office-1"]);
    const taskQuery = pool.queries.find(({ text }) =>
      text.includes("SELECT t.office_id"),
    );
    const grantQuery = pool.queries.find(({ text }) =>
      text.includes("SELECT tool_code"),
    );
    expect(taskQuery?.text).toContain("a.office_id = t.office_id");
    expect(taskQuery?.text).toContain("FOR UPDATE OF t, a");
    expect(grantQuery?.text).toContain("revoked_at IS NULL");
    expect(grantQuery?.text).toContain("valid_from <= now()");
    expect(pool.queries.map((query) => query.text)).toEqual(
      expect.arrayContaining(["BEGIN", "COMMIT"]),
    );
    expect(
      pool.queries.filter(({ text }) =>
        text.includes("INSERT INTO task_event"),
      ),
    ).toHaveLength(3);
  });

  it("denies a missing or cross-office assigned agent before it can read facts", async () => {
    const pool = new RecordingPool();
    pool.taskFound = false;
    const calls: string[] = [];
    const handler = new MarginAnalysisTaskHandler({
      repository: new PostgresMarginAnalysisTaskRepository(pool as never),
      facts: facts(calls),
      now: () => "2026-08-25T12:00:00.000Z",
    });

    await expect(handler.run(job)).rejects.toThrow(
      "margin_analysis_task_unauthorized",
    );

    expect(calls).toEqual([]);
    expect(pool.queries.map((query) => query.text)).toEqual(
      expect.arrayContaining(["BEGIN", "ROLLBACK"]),
    );
    expect(
      pool.queries.some(({ text }) => text.includes("worker_job_delivery")),
    ).toBe(false);
  });
  it("rolls back a same-key report replay when canonical persisted facts differ", async () => {
    const pool = new RecordingPool();
    pool.existingReport = {
      id: "report-1",
      idempotency_key: job.idempotencyKey,
      revenue_numeric: "999.0000",
    };
    const handler = new MarginAnalysisTaskHandler({
      repository: new PostgresMarginAnalysisTaskRepository(pool as never),
      facts: facts([]),
      now: () => "2026-08-25T12:00:00.000Z",
    });

    await expect(handler.run(job)).rejects.toThrow(
      "margin_analysis_report_conflict",
    );

    expect(
      pool.queries.filter(({ text }) =>
        text.includes("INSERT INTO task_event"),
      ),
    ).toHaveLength(0);
    expect(pool.queries.some(({ text }) => text.includes("UPDATE task"))).toBe(
      false,
    );
    expect(pool.queries.map((query) => query.text)).toEqual(
      expect.arrayContaining(["BEGIN", "ROLLBACK"]),
    );
  });
});
