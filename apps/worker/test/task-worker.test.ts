import { describe, expect, it } from "vitest";
import {
  TaskOutboxWorker,
  type TaskJobRunner,
  type TaskQueue,
} from "../src/task-worker.js";

describe("TaskOutboxWorker", () => {
  it("processes a claimed task once and treats a repeated delivery as a no-op", async () => {
    const jobs = [
      {
        outboxId: "outbox-1",
        idempotencyKey: "task.queued:task-1:1",
        taskId: "task-1",
      },
      {
        outboxId: "outbox-2",
        idempotencyKey: "task.queued:task-1:1",
        taskId: "task-1",
      },
    ];
    const settled: Array<{ outboxId: string; delivered: boolean }> = [];
    const queue: TaskQueue = {
      claimNext: async () => jobs.shift() ?? null,
      settle: async (job, delivered) => {
        settled.push({ outboxId: job.outboxId, delivered });
      },
    };
    const seen = new Set<string>();
    const runner: TaskJobRunner = {
      run: async (job) => {
        if (seen.has(job.idempotencyKey)) return false;
        seen.add(job.idempotencyKey);
        return true;
      },
    };
    const worker = new TaskOutboxWorker(queue, runner);

    await expect(worker.consumeOne()).resolves.toBe(true);
    await expect(worker.consumeOne()).resolves.toBe(false);
    expect(settled).toEqual([
      { outboxId: "outbox-1", delivered: true },
      { outboxId: "outbox-2", delivered: false },
    ]);
  });
});
