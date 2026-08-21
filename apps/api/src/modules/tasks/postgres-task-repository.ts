import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { PostgresTaskProjection } from "./postgres-task-projection.js";
import type {
  CreateHumanTaskInput,
  TaskEventRecord,
  TaskRecord,
  TaskRepository,
} from "./task-service.js";

export class PostgresTaskRepository implements TaskRepository {
  constructor(private readonly pool: Pool) {}

  async createHumanTask(
    input: CreateHumanTaskInput & { source: "human" },
  ): Promise<TaskRecord> {
    const taskId = randomUUID();
    const eventId = randomUUID();
    const outboxId = randomUUID();
    const createdAt = new Date();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO task (
          id, office_id, type, title, description, source, priority, status, requested_by_user_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, 'human', $6, 'queued', $7, $8)`,
        [
          taskId,
          input.officeId,
          input.type,
          input.title,
          input.description,
          input.priority,
          input.requestedByUserId,
          createdAt,
        ],
      );
      for (const item of input.context) {
        await client.query(
          "INSERT INTO task_context_item (id, task_id, context_key, value_text) VALUES ($1, $2, $3, $4)",
          [randomUUID(), taskId, item.key, item.value],
        );
      }
      await client.query(
        `INSERT INTO task_event (
          id, task_id, sequence_number, event_type, to_status, actor_user_id, payload_json
        ) VALUES ($1, $2, 1, 'task.queued', 'queued', $3, $4::jsonb)`,
        [
          eventId,
          taskId,
          input.requestedByUserId,
          JSON.stringify({ source: input.source, priority: input.priority }),
        ],
      );
      await client.query(
        `INSERT INTO outbox_message (id, aggregate_type, aggregate_id, topic, payload_json, idempotency_key)
         VALUES ($1, 'task', $2, 'task.queued', $3::jsonb, $4)`,
        [
          outboxId,
          taskId,
          JSON.stringify({ taskId, eventId }),
          `task.queued:${taskId}:1`,
        ],
      );
      await client.query(
        `INSERT INTO audit_log (id, actor_user_id, action, target_type, target_id, outcome, metadata_json)
         VALUES ($1, $2, 'task_created', 'task', $3, 'success', $4::jsonb)`,
        [
          randomUUID(),
          input.requestedByUserId,
          taskId,
          JSON.stringify({ source: input.source, priority: input.priority }),
        ],
      );
      await client.query("COMMIT");
      return { id: taskId, status: "queued", createdAt, ...input };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async findTask(taskId: string): Promise<TaskRecord | null> {
    return new PostgresTaskProjection(this.pool).findTask(taskId);
  }

  async findEvents(taskId: string): Promise<readonly TaskEventRecord[]> {
    return new PostgresTaskProjection(this.pool).findEvents(taskId);
  }
}
