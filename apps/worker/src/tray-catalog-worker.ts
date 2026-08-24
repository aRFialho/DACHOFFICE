import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

const LEASE_SECONDS = 300;
const MAX_ATTEMPTS = 5;
const retryDelaySeconds = (attempt: number): number =>
  Math.min(30 * 2 ** Math.max(0, attempt - 1), 900);

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
  leaseId?: string;
  attemptCount?: number;
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
      await this.queue.settle(job, summary.status !== "retryable");
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
  attempt_count: number;
};
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const runIdFromPayload = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return null;
  const runId = (payload as Record<string, unknown>).runId;
  return typeof runId === "string" && uuidPattern.test(runId) ? runId : null;
};

export class PostgresCatalogSyncQueue implements CatalogSyncQueue {
  constructor(private readonly pool: Pool) {}
  async claimNext(): Promise<CatalogSyncJob | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (;;) {
        const result = await client.query<OutboxRow>(
          `SELECT id, idempotency_key, payload_json, attempt_count FROM outbox_message
           WHERE topic = 'catalog.sync.requested' AND status IN ('pending', 'processing')
             AND available_at <= now()
           ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`,
        );
        const row = result.rows[0];
        if (!row) {
          await client.query("COMMIT");
          return null;
        }
        const runId = runIdFromPayload(row.payload_json);
        if (!runId) {
          await client.query(
            `UPDATE outbox_message SET status = 'delivered', delivered_at = now(),
             payload_json = jsonb_set(payload_json, '{_catalogDelivery}', '{"errorCode":"catalog_outbox_payload_invalid"}'::jsonb, true)
             WHERE id = $1`,
            [row.id],
          );
          continue;
        }
        await client.query(
          "UPDATE catalog_sync_run SET status = 'retryable', failure_code = 'catalog_worker_lease_reclaimed' WHERE id = $1 AND status = 'running'",
          [runId],
        );
        const leaseId = randomUUID();
        await client.query(
          `UPDATE outbox_message SET status = 'processing', attempt_count = attempt_count + 1,
           available_at = now() + ($2 * interval '1 second'),
           payload_json = jsonb_set(payload_json, '{_catalogLease}', $3::jsonb, true)
           WHERE id = $1`,
          [row.id, LEASE_SECONDS, JSON.stringify({ leaseId })],
        );
        await client.query("COMMIT");
        return {
          outboxId: row.id,
          idempotencyKey: row.idempotency_key,
          runId,
          leaseId,
          attemptCount: row.attempt_count + 1,
        };
      }
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async settle(job: CatalogSyncJob, delivered: boolean): Promise<void> {
    const leaseWhere = `id = $1 AND status = 'processing' AND payload_json #>> '{_catalogLease,leaseId}' = $2`;
    if (delivered || (job.attemptCount ?? 1) >= MAX_ATTEMPTS) {
      const errorCode = delivered
        ? "catalog_sync_delivered"
        : "catalog_sync_retry_exhausted";
      await this.pool.query(
        `UPDATE outbox_message SET status = 'delivered', delivered_at = now(),
         payload_json = jsonb_set(payload_json - '_catalogLease', '{_catalogDelivery}', $3::jsonb, true)
         WHERE ${leaseWhere}`,
        [job.outboxId, job.leaseId, JSON.stringify({ errorCode })],
      );
      return;
    }
    const delay = retryDelaySeconds(job.attemptCount ?? 1);
    await this.pool.query(
      `UPDATE outbox_message SET status = 'pending', available_at = now() + ($3 * interval '1 second'),
       payload_json = jsonb_set(payload_json - '_catalogLease', '{_catalogDelivery}', $4::jsonb, true)
       WHERE ${leaseWhere}`,
      [
        job.outboxId,
        job.leaseId,
        delay,
        JSON.stringify({ errorCode: "catalog_sync_retryable" }),
      ],
    );
  }
}
