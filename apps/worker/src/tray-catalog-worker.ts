import type { Pool } from "pg";

export type CatalogSyncSummary = {
  runId: string;
  status: "completed" | "retryable" | "not_claimed";
  pagesSeen: number;
  itemsSeen: number;
  mappedCount: number;
  unresolvedCount: number;
};

export interface CatalogSyncRunner {
  run(runId: string): Promise<CatalogSyncSummary>;
}

export interface CatalogSyncJob {
  outboxId: string;
  idempotencyKey: string;
  runId: string;
}

export interface CatalogSyncQueue {
  claimNext(): Promise<CatalogSyncJob | null>;
  settle(job: CatalogSyncJob, delivered: boolean): Promise<void>;
}

export class TrayCatalogOutboxWorker {
  constructor(
    private readonly queue: CatalogSyncQueue,
    private readonly syncService: CatalogSyncRunner,
  ) {}

  async consumeOne(): Promise<boolean> {
    const job = await this.queue.claimNext();
    if (!job) return false;
    try {
      const summary = await this.syncService.run(job.runId);
      const delivered = summary.status !== "retryable";
      await this.queue.settle(job, delivered);
      return summary.status === "completed";
    } catch {
      await this.queue.settle(job, false);
      throw new Error("catalog sync job failed");
    }
  }
}

type OutboxRow = {
  id: string;
  idempotency_key: string;
  payload_json: unknown;
};

const runIdFromPayload = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const runId = (payload as Record<string, unknown>).runId;
  return typeof runId === "string" && runId.trim() !== "" ? runId : null;
};

export class PostgresCatalogSyncQueue implements CatalogSyncQueue {
  constructor(private readonly pool: Pool) {}

  async claimNext(): Promise<CatalogSyncJob | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<OutboxRow>(
        `SELECT id, idempotency_key, payload_json FROM outbox_message
         WHERE topic = 'catalog.sync.requested' AND status = 'pending'
           AND available_at <= now()
         ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`,
      );
      const row = result.rows[0];
      const runId = row && runIdFromPayload(row.payload_json);
      if (!row || !runId) {
        await client.query("COMMIT");
        return null;
      }
      await client.query(
        "UPDATE outbox_message SET status = 'processing', attempt_count = attempt_count + 1 WHERE id = $1",
        [row.id],
      );
      await client.query("COMMIT");
      return { outboxId: row.id, idempotencyKey: row.idempotency_key, runId };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async settle(job: CatalogSyncJob, delivered: boolean): Promise<void> {
    await this.pool.query(
      delivered
        ? "UPDATE outbox_message SET status = 'delivered', delivered_at = now() WHERE id = $1"
        : "UPDATE outbox_message SET status = 'pending', available_at = now() WHERE id = $1",
      [job.outboxId],
    );
  }
}
