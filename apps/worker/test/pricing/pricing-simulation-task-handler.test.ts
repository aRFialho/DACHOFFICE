import { describe, expect, it } from "vitest";
import {
  PricingSimulationTaskHandler,
  type PricingSimulationFactsRepository,
  type PricingSimulationTaskRepository,
  type PricingSimulationTaskTransaction,
} from "../../src/pricing/pricing-simulation-task-handler.js";

const job = {
  outboxId: "outbox-1",
  idempotencyKey: "task.queued:task-1:1",
  taskId: "task-1",
};

class FakeTransaction implements PricingSimulationTaskTransaction {
  calls: string[] = [];
  deliveryClaimed = true;
  authorized = true;
  reports: unknown[] = [];
  actions: unknown[] = [];
  workbooks: unknown[] = [];
  context = [
    { key: "agentVersionId", value: "version-1" },
    { key: "skus", value: '["SKU-1"]' },
    { key: "channel", value: "tray" },
    { key: "discountPercent", value: "10.0000" },
    { key: "periodStart", value: "2026-08-01T00:00:00.000Z" },
    { key: "periodEnd", value: "2026-08-31T23:59:59.999Z" },
  ];

  async loadTask() {
    this.calls.push("task");
    return { officeId: "office-1", agentId: "agent-1", status: "queued" };
  }
  async loadContext() {
    this.calls.push("context");
    return this.context;
  }
  async authorize(input: {
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
  async persistWorkbookArtifact(input: unknown) {
    this.calls.push("workbook");
    this.workbooks.push(input);
  }
  async persistPreparedActions(input: unknown) {
    this.calls.push("actions");
    this.actions.push(input);
  }
  async completeTask() {
    this.calls.push("complete");
  }
}

class FakeRepository implements PricingSimulationTaskRepository {
  readonly transaction = new FakeTransaction();
  rolledBack = false;
  async isPricingSimulationTask() {
    return true;
  }
  async inTransaction<T>(
    action: (transaction: PricingSimulationTaskTransaction) => Promise<T>,
  ): Promise<T> {
    try {
      return await action(this.transaction);
    } catch (error) {
      this.rolledBack = true;
      throw error;
    }
  }
}

const facts = (): PricingSimulationFactsRepository & { calls: string[] } => ({
  calls: [],
  async loadProducts(input) {
    this.calls.push(`products:${input.officeId}`);
    return [
      {
        productId: "product-1",
        sku: "SKU-1",
        name: "Chair",
        supplierId: "supplier-1",
      },
    ];
  },
  async loadCosts() {
    this.calls.push("costs");
    return [
      {
        sku: "SKU-1",
        cost: {
          status: "found",
          source: "supplier_table",
          cost: "20.0000",
          currency: "BRL",
          effectiveAt: "2026-08-01T00:00:00.000Z",
          sourceReference: "supplier-row:1",
        },
      },
    ] as never;
  },
  async loadListings() {
    this.calls.push("listings");
    return [
      {
        sku: "SKU-1",
        listing: {
          status: "found",
          listingId: "listing-1",
          price: "100.0000",
          currency: "BRL",
          observedAt: "2026-08-20T00:00:00.000Z",
          sourceReference: "listing:1",
        },
      },
    ] as never;
  },
  async loadFeeAssumptions() {
    this.calls.push("fees");
    return [
      {
        ruleId: "rule-1",
        componentType: "marketplace_commission",
        payer: "seller",
        feeMode: "percentage",
        value: "10.0000",
        confidence: "ESTIMATED",
        validFrom: "2026-01-01T00:00:00.000Z",
      },
    ] as never;
  },
});

describe("PricingSimulationTaskHandler", () => {
  it("authorizes before reading facts, persists the report, and prepares only safe actions", async () => {
    const repository = new FakeRepository();
    const sourceFacts = facts();
    const handler = new PricingSimulationTaskHandler({
      repository,
      facts: sourceFacts,
      now: () => "2026-08-25T12:00:00.000Z",
      renderWorkbook: async () => Buffer.from("xlsx"),
    });

    await expect(handler.canHandle(job)).resolves.toBe(true);
    await expect(handler.run(job)).resolves.toBe(true);

    expect(repository.transaction.calls).toEqual([
      "delivery",
      "task",
      "context",
      "authorize",
      "report",
      "workbook",
      "actions",
      "complete",
    ]);
    expect(sourceFacts.calls).toEqual([
      "products:office-1",
      "costs",
      "listings",
      "fees",
    ]);
    expect(repository.transaction.reports[0]).toEqual(
      expect.objectContaining({
        idempotencyKey: job.idempotencyKey,
        report: expect.objectContaining({
          status: "completed",
          confidence: "ESTIMATED",
        }),
      }),
    );
    expect(repository.transaction.workbooks[0]).toEqual(
      expect.objectContaining({
        reportId: "report-1",
        idempotencyKey: job.idempotencyKey,
        content: Buffer.from("xlsx"),
      }),
    );
    expect(repository.transaction.actions[0]).toEqual(
      expect.objectContaining({
        reportId: "report-1",
        actions: [
          expect.objectContaining({
            productId: "product-1",
            proposedPrice: "90.0000",
          }),
        ],
      }),
    );
  });

  it("does not read facts when authorization is revoked or delivery was already claimed", async () => {
    const deniedRepository = new FakeRepository();
    deniedRepository.transaction.authorized = false;
    const deniedFacts = facts();
    const denied = new PricingSimulationTaskHandler({
      repository: deniedRepository,
      facts: deniedFacts,
    });
    await expect(denied.run(job)).rejects.toThrow(
      "pricing_simulation_task_unauthorized",
    );
    expect(deniedFacts.calls).toEqual([]);
    expect(deniedRepository.rolledBack).toBe(true);

    const replayRepository = new FakeRepository();
    replayRepository.transaction.deliveryClaimed = false;
    const replayFacts = facts();
    const replay = new PricingSimulationTaskHandler({
      repository: replayRepository,
      facts: replayFacts,
    });
    await expect(replay.run(job)).resolves.toBe(true);
    expect(replayFacts.calls).toEqual([]);
    expect(replayRepository.transaction.calls).toEqual(["delivery"]);
  });
});
