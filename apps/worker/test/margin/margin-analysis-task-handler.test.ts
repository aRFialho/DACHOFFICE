import { describe, expect, it } from "vitest";
import {
  MarginAnalysisTaskHandler,
  type MarginAnalysisFactsRepository,
  type MarginAnalysisTaskRepository,
  type MarginAnalysisTaskTransaction,
} from "../../src/margin/margin-analysis-task-handler.js";
import { TaskOutboxWorker, type TaskQueue } from "../../src/task-worker.js";

const job = {
  outboxId: "outbox-1",
  idempotencyKey: "task.queued:task-1:1",
  taskId: "task-1",
};

const order = (overrides: Record<string, unknown> = {}) => ({
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
  ...overrides,
});

class FakeTransaction implements MarginAnalysisTaskTransaction {
  calls: string[] = [];
  deliveryClaimed = true;
  authorized = true;
  reports: unknown[] = [];
  completions = 0;
  context = [
    { key: "periodStart", value: "2026-08-01T00:00:00.000Z" },
    { key: "periodEnd", value: "2026-08-31T23:59:59.999Z" },
    { key: "agentVersionId", value: "version-1" },
    { key: "channels", value: '["shopee"]' },
    { key: "skus", value: '["SKU-1"]' },
  ];

  async loadTask() {
    this.calls.push("task");
    return { officeId: "office-1", agentId: "agent-1", status: "queued" };
  }

  async loadContext() {
    this.calls.push("context");
    return this.context;
  }

  async authorizeReadAccess(input: {
    officeId: string;
    agentId: string;
    requestedAgentVersionId: string;
  }) {
    this.calls.push("authorize");
    return (
      this.authorized &&
      input.officeId === "office-1" &&
      input.agentId === "agent-1" &&
      input.requestedAgentVersionId === "version-1"
    );
  }

  async claimDelivery() {
    this.calls.push("delivery");
    return this.deliveryClaimed;
  }

  async persistReport(input: unknown) {
    this.calls.push("report");
    this.reports.push(input);
    return { status: "created" as const, reportId: "report-1" };
  }

  async completeTask() {
    this.calls.push("complete");
    this.completions += 1;
  }
}

class FakeTaskRepository implements MarginAnalysisTaskRepository {
  readonly transaction = new FakeTransaction();
  rolledBack = false;
  marginTask = true;

  async isMarginAnalysisTask(): Promise<boolean> {
    return this.marginTask;
  }

  async inTransaction<T>(
    action: (transaction: MarginAnalysisTaskTransaction) => Promise<T>,
  ): Promise<T> {
    try {
      return await action(this.transaction);
    } catch (error) {
      this.rolledBack = true;
      throw error;
    }
  }
}

const facts = (
  orders = [order()],
): MarginAnalysisFactsRepository & {
  calls: string[];
} => ({
  calls: [],
  async loadLatestSnapshots(input) {
    this.calls.push(`snapshots:${input.officeId}`);
    return orders as never;
  },
  async loadCanonicalCosts(input) {
    this.calls.push(`costs:${input.officeId}`);
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

describe("MarginAnalysisTaskHandler", () => {
  it("runs a server-owned, authorized margin task once and preserves the engine report", async () => {
    const repository = new FakeTaskRepository();
    const sourceFacts = facts();
    const handler = new MarginAnalysisTaskHandler({
      repository,
      facts: sourceFacts,
      now: () => "2026-08-25T12:00:00.000Z",
    });

    await expect(handler.canHandle(job)).resolves.toBe(true);
    await expect(handler.run(job)).resolves.toBe(true);
    repository.transaction.deliveryClaimed = false;
    await expect(handler.run(job)).resolves.toBe(true);

    expect(sourceFacts.calls).toEqual(["snapshots:office-1", "costs:office-1"]);
    expect(repository.transaction.calls).toEqual([
      "task",
      "context",
      "authorize",
      "delivery",
      "report",
      "complete",
      "task",
      "context",
      "authorize",
      "delivery",
    ]);
    expect(repository.transaction.reports).toEqual([
      expect.objectContaining({
        idempotencyKey: job.idempotencyKey,
        calculatedAt: "2026-08-25T12:00:00.000Z",
        report: expect.objectContaining({
          status: "completed",
          confidence: "REAL",
          provenance: expect.objectContaining({
            officeId: "office-1",
            agentId: "agent-1",
            agentVersionId: "version-1",
          }),
        }),
      }),
    ]);
  });

  it("acknowledges an already-completed delivery without repeating task or report work", async () => {
    const repository = new FakeTaskRepository();
    repository.transaction.deliveryClaimed = false;
    const sourceFacts = facts();
    const handler = new MarginAnalysisTaskHandler({
      repository,
      facts: sourceFacts,
      now: () => "2026-08-25T12:00:00.000Z",
    });
    const settled: boolean[] = [];
    const queue: TaskQueue = {
      claimNext: async () => job,
      settle: async (_job, delivered) => {
        settled.push(delivered);
      },
    };

    await expect(
      new TaskOutboxWorker(queue, handler).consumeOne(),
    ).resolves.toBe(true);

    expect(settled).toEqual([true]);
    expect(sourceFacts.calls).toEqual([]);
    expect(repository.transaction.reports).toEqual([]);
    expect(repository.transaction.completions).toBe(0);
  });
  it("preserves ESTIMATED and explicit no-data engine outcomes", async () => {
    const estimatedRepository = new FakeTaskRepository();
    const estimated = new MarginAnalysisTaskHandler({
      repository: estimatedRepository,
      facts: facts([
        order(),
        order({
          orderId: "order-2",
          snapshotId: "snapshot-2",
          confidence: "ESTIMATED",
        }),
      ]),
      now: () => "2026-08-25T12:00:00.000Z",
    });
    await estimated.run(job);
    expect(estimatedRepository.transaction.reports[0]).toEqual(
      expect.objectContaining({
        report: expect.objectContaining({ confidence: "ESTIMATED" }),
      }),
    );

    const emptyRepository = new FakeTaskRepository();
    const empty = new MarginAnalysisTaskHandler({
      repository: emptyRepository,
      facts: facts([]),
      now: () => "2026-08-25T12:00:00.000Z",
    });
    await empty.run(job);
    expect(emptyRepository.transaction.reports[0]).toEqual(
      expect.objectContaining({
        report: expect.objectContaining({ status: "no_margin_snapshots" }),
      }),
    );
  });

  it("rejects invalid context or revoked authorization before financial reads", async () => {
    const invalidRepository = new FakeTaskRepository();
    invalidRepository.transaction.context = [
      { key: "periodStart", value: "not-a-timestamp" },
      { key: "periodEnd", value: "2026-08-31T23:59:59.999Z" },
      { key: "agentVersionId", value: "version-1" },
    ];
    const invalidFacts = facts();
    const invalid = new MarginAnalysisTaskHandler({
      repository: invalidRepository,
      facts: invalidFacts,
      now: () => "2026-08-25T12:00:00.000Z",
    });
    await expect(invalid.run(job)).rejects.toThrow(
      "margin_analysis_task_context_invalid",
    );
    expect(invalidFacts.calls).toEqual([]);
    expect(invalidRepository.transaction.reports).toEqual([]);

    const deniedRepository = new FakeTaskRepository();
    deniedRepository.transaction.authorized = false;
    const deniedFacts = facts();
    const denied = new MarginAnalysisTaskHandler({
      repository: deniedRepository,
      facts: deniedFacts,
      now: () => "2026-08-25T12:00:00.000Z",
    });
    await expect(denied.run(job)).rejects.toThrow(
      "margin_analysis_task_unauthorized",
    );
    expect(deniedFacts.calls).toEqual([]);
    expect(deniedRepository.transaction.reports).toEqual([]);
    expect(deniedRepository.transaction.calls).not.toContain("delivery");
  });

  it("rolls back a retryable fact-storage failure without completing the task", async () => {
    const repository = new FakeTaskRepository();
    const unavailableFacts: MarginAnalysisFactsRepository = {
      loadLatestSnapshots: async () => {
        throw Object.assign(new Error("unavailable"), {
          code: "margin_analysis_repository_retryable",
        });
      },
      loadCanonicalCosts: async () => [],
    };
    const handler = new MarginAnalysisTaskHandler({
      repository,
      facts: unavailableFacts,
      now: () => "2026-08-25T12:00:00.000Z",
    });

    await expect(handler.run(job)).rejects.toMatchObject({
      code: "margin_analysis_repository_retryable",
    });
    expect(repository.rolledBack).toBe(true);
    expect(repository.transaction.reports).toEqual([]);
    expect(repository.transaction.completions).toBe(0);
  });
});
