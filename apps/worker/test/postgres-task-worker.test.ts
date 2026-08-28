import { describe, expect, it } from "vitest";
import {
  PostgresTaskJobRunner,
  type TaskJobDispatcher,
} from "../src/postgres-task-worker.js";

const genericJob = {
  outboxId: "outbox-1",
  idempotencyKey: "task.queued:task-1:1",
  taskId: "task-1",
};

const recordingPool = () => {
  const queries: Array<{ text: string; values?: unknown[] }> = [];
  const client = {
    async query(text: string, values?: unknown[]) {
      queries.push({ text, ...(values === undefined ? {} : { values }) });
      if (text.includes("INSERT INTO worker_job_delivery")) {
        return {
          rowCount: 1,
          rows: [{ idempotency_key: genericJob.idempotencyKey }],
        };
      }
      if (text.includes("UPDATE task SET status = 'completed'")) {
        return { rowCount: 1, rows: [{ id: genericJob.taskId }] };
      }
      return { rowCount: 1, rows: [] };
    },
    release: () => undefined,
  };
  return {
    queries,
    pool: { connect: async () => client },
  };
};

describe("PostgresTaskJobRunner", () => {
  it("keeps generic queued tasks on the existing completion/event path", async () => {
    const recording = recordingPool();
    const runner = new PostgresTaskJobRunner(recording.pool as never);

    await expect(runner.run(genericJob)).resolves.toBe(true);

    const events = recording.queries.filter(({ text }) =>
      text.includes("INSERT INTO task_event"),
    );
    expect(events).toHaveLength(3);
    expect(events.map((event) => event.values?.[3])).toEqual([
      "task.assigned",
      "task.executing",
      "task.completed",
    ]);
  });

  it("uses the injected dispatcher only for a matching task", async () => {
    const recording = recordingPool();
    const calls: string[] = [];
    const dispatch: TaskJobDispatcher = {
      canHandle: async (job) => {
        calls.push(`can:${job.taskId}`);
        return true;
      },
      run: async (job) => {
        calls.push(`run:${job.taskId}`);
        return true;
      },
    };
    const runner = new PostgresTaskJobRunner(recording.pool as never, dispatch);

    await expect(runner.run(genericJob)).resolves.toBe(true);

    expect(calls).toEqual(["can:task-1", "run:task-1"]);
    expect(recording.queries).toEqual([]);
  });
});
