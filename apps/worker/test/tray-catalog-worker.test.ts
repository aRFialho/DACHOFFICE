import { describe, expect, it } from "vitest";
import {
  TrayCatalogOutboxWorker,
  type CatalogSyncJob,
  type CatalogSyncQueue,
} from "../src/tray-catalog-worker.js";

describe("TrayCatalogOutboxWorker", () => {
  it("runs a repeated catalog outbox delivery only once", async () => {
    const jobs: CatalogSyncJob[] = [
      {
        outboxId: "outbox-1",
        idempotencyKey: "catalog.sync.requested:run-1",
        runId: "run-1",
      },
      {
        outboxId: "outbox-2",
        idempotencyKey: "catalog.sync.requested:run-1",
        runId: "run-1",
      },
    ];
    const settled: Array<{ outboxId: string; delivered: boolean }> = [];
    const queue: CatalogSyncQueue = {
      claimNext: async () => jobs.shift() ?? null,
      settle: async (job, delivered) => {
        settled.push({ outboxId: job.outboxId, delivered });
      },
    };
    const completedRuns = new Set<string>();
    const worker = new TrayCatalogOutboxWorker(queue, {
      run: async (runId) => {
        if (completedRuns.has(runId)) {
          return {
            runId,
            status: "not_claimed",
            pagesSeen: 0,
            itemsSeen: 0,
            mappedCount: 0,
            unresolvedCount: 0,
          };
        }
        completedRuns.add(runId);
        return {
          runId,
          status: "completed",
          pagesSeen: 1,
          itemsSeen: 1,
          mappedCount: 1,
          unresolvedCount: 0,
        };
      },
    });

    await expect(worker.consumeOne()).resolves.toBe(true);
    await expect(worker.consumeOne()).resolves.toBe(false);
    expect(settled).toEqual([
      { outboxId: "outbox-1", delivered: true },
      { outboxId: "outbox-2", delivered: true },
    ]);
  });
});
