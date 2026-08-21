import type { Pool } from "pg";
import type { TaskEventRecord, TaskRecord } from "./task-service.js";

type TaskRow = Omit<TaskRecord, "createdAt" | "context"> & {
  office_id: string;
  requested_by_user_id: string;
  created_at: Date;
};

export class PostgresTaskProjection {
  constructor(private readonly pool: Pool) {}

  async findTask(taskId: string): Promise<TaskRecord | null> {
    const result = await this.pool.query<TaskRow>(
      `SELECT id, office_id, type, title, description, source, priority, status,
              requested_by_user_id, created_at
       FROM task WHERE id = $1`,
      [taskId],
    );
    const row = result.rows[0];
    if (!row) return null;
    const context = await this.pool.query<{
      context_key: string;
      value_text: string;
    }>(
      "SELECT context_key, value_text FROM task_context_item WHERE task_id = $1 ORDER BY context_key",
      [taskId],
    );
    return {
      id: row.id,
      officeId: row.office_id,
      type: row.type,
      title: row.title,
      description: row.description,
      source: row.source,
      priority: row.priority,
      status: row.status,
      requestedByUserId: row.requested_by_user_id,
      createdAt: row.created_at,
      context: context.rows.map((item) => ({
        key: item.context_key,
        value: item.value_text,
      })),
    };
  }

  async findEvents(taskId: string): Promise<readonly TaskEventRecord[]> {
    const result = await this.pool.query<{
      sequence_number: number;
      event_type: string;
      from_status: TaskEventRecord["fromStatus"];
      to_status: TaskEventRecord["toStatus"];
      created_at: Date;
    }>(
      `SELECT sequence_number, event_type, from_status, to_status, created_at
       FROM task_event WHERE task_id = $1 ORDER BY sequence_number`,
      [taskId],
    );
    return result.rows.map((row) => ({
      sequenceNumber: row.sequence_number,
      eventType: row.event_type,
      fromStatus: row.from_status,
      toStatus: row.to_status,
      createdAt: row.created_at,
    }));
  }
}
