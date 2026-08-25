import { describe, expect, it } from "vitest";
import { createTaskJobDispatcher } from "../src/task-dispatcher.js";

const job = { outboxId: "outbox-1", idempotencyKey: "key-1", taskId: "task-1" };

describe("createTaskJobDispatcher", () => {
  it("routes a specialized task to its matching handler and retains other handlers", async () => {
    const calls: string[] = [];
    const margin = { canHandle: async () => false, run: async () => true };
    const pricing = {
      canHandle: async () => { calls.push("pricing:can"); return true; },
      run: async () => { calls.push("pricing:run"); return true; },
    };
    const dispatcher = createTaskJobDispatcher([margin, pricing]);

    await expect(dispatcher.canHandle(job)).resolves.toBe(true);
    await expect(dispatcher.run(job)).resolves.toBe(true);
    expect(calls).toEqual(["pricing:can", "pricing:can", "pricing:run"]);
  });

  it("does not claim generic tasks that no specialized handler recognizes", async () => {
    const dispatcher = createTaskJobDispatcher([{ canHandle: async () => false, run: async () => true }]);
    await expect(dispatcher.canHandle(job)).resolves.toBe(false);
    await expect(dispatcher.run(job)).resolves.toBe(false);
  });
});
