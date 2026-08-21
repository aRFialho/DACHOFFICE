import { describe, expect, it } from "vitest";
import { PostgresCatalogSyncQueue } from "../src/tray-catalog-worker.js";

describe("PostgresCatalogSyncQueue durability", () => {
  it("dead-letters a malformed row and claims the following valid catalog job", async () => {
    const queries: string[] = [];
    let selects = 0;
    const pool = {
      connect: async () => ({
        query: async (text: string) => {
          queries.push(text);
          if (text.includes("SELECT id, idempotency_key")) {
            selects += 1;
            return {
              rows: selects === 1
                ? [{ id: "bad", idempotency_key: "bad", payload_json: {} }]
                : [{ id: "good", idempotency_key: "good", payload_json: { runId: "run-1" }, attempt_count: 0 }],
            };
          }
          return { rows: [] };
        },
        release: () => undefined,
      }),
      query: async () => ({ rows: [] }),
    };

    await expect(new PostgresCatalogSyncQueue(pool as never).claimNext()).resolves.toMatchObject({
      outboxId: "good",
      runId: "run-1",
    });
    expect(queries.some((query) => query.includes("catalog_outbox_payload_invalid"))).toBe(true);
  });

  it("claims expired processing leases and schedules retryable delivery with backoff", async () => {
    const queries: Array<{ text: string; values: readonly unknown[] | undefined }> = [];
    const pool = {
      connect: async () => ({
        query: async (text: string, values: readonly unknown[] | undefined) => {
          queries.push({ text, values });
          if (text.includes("SELECT id, idempotency_key")) {
            return { rows: [{ id: "stale", idempotency_key: "stale", payload_json: { runId: "run-2" }, attempt_count: 1 }] };
          }
          return { rows: [] };
        },
        release: () => undefined,
      }),
      query: async (text: string, values: readonly unknown[] | undefined) => {
        queries.push({ text, values });
        return { rows: [] };
      },
    };
    const queue = new PostgresCatalogSyncQueue(pool as never);
    const job = await queue.claimNext();
    await queue.settle(job!, false);

    expect(queries.some(({ text }) => text.includes("status IN ('pending', 'processing')"))).toBe(true);
    expect(queries.some(({ text, values }) => text.includes("interval '1 second'") && values?.includes(60))).toBe(true);
  });
});
