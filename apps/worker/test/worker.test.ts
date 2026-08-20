import { describe, expect, it } from "vitest";
import { createFoundationQueue } from "../src/worker.js";

describe("Sprint 0 worker queue", () => {
  it("accepts, consumes, and completes a unique job", async () => {
    const queue = createFoundationQueue();
    const received: string[] = [];
    const job = { id: "job-1", idempotencyKey: "job-1", message: "ready" };
    queue.enqueue(job);
    queue.enqueue(job);
    await expect(
      queue.drain(async (next) => {
        received.push(next.id);
      }),
    ).resolves.toBe(1);
    expect(received).toEqual(["job-1"]);
  });
});
