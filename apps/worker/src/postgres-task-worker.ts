import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { TaskJobRunner, TaskOutboxJob, TaskQueue } from "./task-worker.js";

type OutboxRow = {
  id: string;
  idempotency_key: string;
  payload_json: unknown;
};

const taskIdFromPayload = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return null;
  const taskId = (payload as Record<string, unknown>).taskId;
  return typeof taskId === "string" ? taskId : null;
};

export class PostgresTaskQueue implements TaskQueue {
  constructor(private readonly pool: Pool) {}

  async claimNext(): Promise<TaskOutboxJob | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<OutboxRow>(
        `SELECT id, idempotency_key, payload_json FROM outbox_message
         WHERE topic = 'task.queued' AND status = 'pending' AND available_at <= now()
         ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`,
      );
      const row = result.rows[0];
      const taskId = row && taskIdFromPayload(row.payload_json);
      if (!row || !taskId) {
        await client.query("COMMIT");
        return null;
      }
      await client.query(
        "UPDATE outbox_message SET status = 'processing', attempt_count = attempt_count + 1 WHERE id = $1",
        [row.id],
      );
      await client.query("COMMIT");
      return { outboxId: row.id, idempotencyKey: row.idempotency_key, taskId };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async settle(job: TaskOutboxJob, delivered: boolean): Promise<void> {
    await this.pool.query(
      delivered
        ? "UPDATE outbox_message SET status = 'delivered', delivered_at = now() WHERE id = $1"
        : "UPDATE outbox_message SET status = 'pending', available_at = now() WHERE id = $1",
      [job.outboxId],
    );
  }
}

export class PostgresTaskJobRunner implements TaskJobRunner {
  constructor(private readonly pool: Pool) {}

  async run(job: TaskOutboxJob): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const delivery = await client.query(
        "INSERT INTO worker_job_delivery (idempotency_key) VALUES ($1) ON CONFLICT DO NOTHING RETURNING idempotency_key",
        [job.idempotencyKey],
      );
      if (delivery.rowCount !== 1) {
        await client.query("COMMIT");
        return false;
      }
      const task = await client.query(
        "UPDATE task SET status = 'completed', completed_at = now() WHERE id = $1 AND status = 'queued' RETURNING id",
        [job.taskId],
      );
      if (task.rowCount !== 1) throw new Error("task is not queued");
      for (const [sequence, from, to] of [
        [2, "queued", "assigned"],
        [3, "assigned", "executing"],
        [4, "executing", "completed"],
      ] as const) {
        await client.query(
          `INSERT INTO task_event (id, task_id, sequence_number, event_type, from_status, to_status)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [randomUUID(), job.taskId, sequence, `task.${to}`, from, to],
        );
      }
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
