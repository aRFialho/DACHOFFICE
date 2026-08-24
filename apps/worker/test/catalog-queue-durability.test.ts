import { describe, expect, it } from "vitest";
import { PostgresCatalogRepository } from "../../../packages/catalog/src/postgres-catalog-repository.js";
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
              rows:
                selects === 1
                  ? [{ id: "bad", idempotency_key: "bad", payload_json: {} }]
                  : [
                      {
                        id: "good",
                        idempotency_key: "good",
                        payload_json: {
                          runId: "00000000-0000-4000-8000-000000000001",
                        },
                        attempt_count: 0,
                      },
                    ],
            };
          }
          return { rows: [] };
        },
        release: () => undefined,
      }),
      query: async () => ({ rows: [] }),
    };

    await expect(
      new PostgresCatalogSyncQueue(pool as never).claimNext(),
    ).resolves.toMatchObject({
      outboxId: "good",
      runId: "00000000-0000-4000-8000-000000000001",
    });
    expect(
      queries.some((query) => query.includes("catalog_outbox_payload_invalid")),
    ).toBe(true);
  });

  it("dead-letters a non-UUID runId before it can reach catalog_sync_run", async () => {
    const queries: string[] = [];
    let selects = 0;
    const validRunId = "a1cdd4e2-3bc4-4f3a-8fd0-f53b5b67b06c";
    const pool = {
      connect: async () => ({
        query: async (text: string) => {
          queries.push(text);
          if (text.includes("SELECT id, idempotency_key")) {
            selects += 1;
            return {
              rows:
                selects === 1
                  ? [
                      {
                        id: "bad-uuid",
                        idempotency_key: "bad-uuid",
                        payload_json: { runId: "not-a-uuid" },
                        attempt_count: 0,
                      },
                    ]
                  : [
                      {
                        id: "good-uuid",
                        idempotency_key: "good-uuid",
                        payload_json: { runId: validRunId },
                        attempt_count: 0,
                      },
                    ],
            };
          }
          return { rows: [] };
        },
        release: () => undefined,
      }),
      query: async () => ({ rows: [] }),
    };

    await expect(
      new PostgresCatalogSyncQueue(pool as never).claimNext(),
    ).resolves.toMatchObject({
      outboxId: "good-uuid",
      runId: validRunId,
    });
    expect(
      queries.some((query) => query.includes("catalog_outbox_payload_invalid")),
    ).toBe(true);
    expect(
      queries.filter((query) => query.includes("UPDATE catalog_sync_run"))
        .length,
    ).toBe(1);
  });

  it("claims expired processing leases and schedules retryable delivery with backoff", async () => {
    const queries: Array<{
      text: string;
      values: readonly unknown[] | undefined;
    }> = [];
    const pool = {
      connect: async () => ({
        query: async (text: string, values: readonly unknown[] | undefined) => {
          queries.push({ text, values });
          if (text.includes("SELECT id, idempotency_key")) {
            return {
              rows: [
                {
                  id: "stale",
                  idempotency_key: "stale",
                  payload_json: {
                    runId: "00000000-0000-4000-8000-000000000002",
                  },
                  attempt_count: 1,
                },
              ],
            };
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

    expect(
      queries.some(({ text }) =>
        text.includes("status IN ('pending', 'processing')"),
      ),
    ).toBe(true);
    expect(
      queries.some(
        ({ text, values }) =>
          text.includes("interval '1 second'") && values?.includes(60),
      ),
    ).toBe(true);
  });
});

it("returns a crashed running catalog run to a claimable state when reclaiming its lease", async () => {
  let runStatus: "running" | "retryable" = "running";
  const client = {
    query: async (text: string) => {
      if (text.includes("SELECT id, idempotency_key")) {
        return {
          rows: [
            {
              id: "stale",
              idempotency_key: "stale",
              payload_json: { runId: "00000000-0000-4000-8000-000000000002" },
              attempt_count: 1,
            },
          ],
        };
      }
      if (
        text.includes("SET status = 'retryable'") &&
        text.includes("catalog_worker_lease_reclaimed")
      ) {
        if (runStatus === "running") runStatus = "retryable";
        return { rows: [] };
      }
      if (
        text.includes("UPDATE catalog_sync_run") &&
        text.includes("SET status = 'running'")
      ) {
        if (runStatus !== "retryable") return { rows: [] };
        runStatus = "running";
        return {
          rows: [
            {
              id: "00000000-0000-4000-8000-000000000002",
              office_id: "office-1",
              integration_id: "integration-1",
              checkpoint_json: {},
              requested_at: new Date("2026-08-24T00:00:00.000Z"),
              pages_seen: 0,
              items_seen: 0,
              mapped_count: 0,
              unresolved_count: 0,
            },
          ],
        };
      }
      return { rows: [] };
    },
    release: () => undefined,
  };
  const pool = {
    connect: async () => client,
    query: async () => ({ rows: [] }),
  };

  await expect(
    new PostgresCatalogSyncQueue(pool as never).claimNext(),
  ).resolves.toMatchObject({ runId: "00000000-0000-4000-8000-000000000002" });
  await expect(
    new PostgresCatalogRepository({
      pool: pool as never,
      currency: "BRL",
    }).claimRun("00000000-0000-4000-8000-000000000002"),
  ).resolves.toMatchObject({ id: "00000000-0000-4000-8000-000000000002" });
});
