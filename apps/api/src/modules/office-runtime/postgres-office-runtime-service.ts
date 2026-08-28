import type { Pool } from "pg";
import type {
  OfficeRuntimeAgent,
  OfficeRuntimeEvent,
  OfficeRuntimeEventType,
  OfficeRuntimeSchedulePhase,
  OfficeRuntimeService,
  OfficeRuntimeSnapshot,
  OfficeRuntimeTrustLevel,
} from "./office-runtime-service.js";

type OfficeRow = {
  trust_level: OfficeRuntimeTrustLevel;
  workday_end: string;
  workday_start: string;
};
type AgentRow = {
  current_state: string;
  id: string;
  lifecycle_status: string;
};
type SequenceRow = { event_sequence: string };
type EventRow = {
  event_id: string;
  event_sequence: string;
  event_type: OfficeRuntimeEventType;
  occurred_at: Date;
  payload_json: Record<string, unknown>;
};

const schedulePhase = (office: OfficeRow): OfficeRuntimeSchedulePhase => {
  const now = new Date();
  const current = `${String(now.getUTCHours()).padStart(2, "0")}:${String(
    now.getUTCMinutes(),
  ).padStart(2, "0")}`;
  return current >= office.workday_start && current < office.workday_end
    ? "WORKDAY"
    : "OFF_DUTY";
};

const asSequence = (value: string): number => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0)
    throw new Error("office runtime event sequence is invalid");
  return number;
};

export class PostgresOfficeRuntimeService implements OfficeRuntimeService {
  constructor(private readonly pool: Pool) {}

  async snapshotForOffice(officeId: string): Promise<OfficeRuntimeSnapshot> {
    const office = await this.pool.query<OfficeRow>(
      `SELECT o.trust_level, s.workday_start::text, s.workday_end::text
       FROM office o JOIN office_settings s ON s.office_id = o.id
       WHERE o.id = $1 AND o.status = 'active'`,
      [officeId],
    );
    const source = office.rows[0];
    if (!source) throw new Error("office runtime is unavailable");

    const [agents, cursor] = await Promise.all([
      this.pool.query<AgentRow>(
        `SELECT id, lifecycle_status, current_state
         FROM agent WHERE office_id = $1 AND lifecycle_status <> 'archived'
         ORDER BY id`,
        [officeId],
      ),
      this.pool.query<SequenceRow>(
        `SELECT COALESCE(MAX(sequence), 0)::text AS event_sequence
         FROM office_runtime_event WHERE office_id = $1`,
        [officeId],
      ),
    ]);

    return {
      agents: agents.rows.map(
        (agent): OfficeRuntimeAgent => ({
          activitySummary: null,
          destinationId: null,
          id: agent.id,
          lifecycleStatus: agent.lifecycle_status,
          state: agent.current_state,
        }),
      ),
      alerts: [],
      approvals: [],
      eventSequence: asSequence(cursor.rows[0]?.event_sequence ?? "0"),
      meetings: [],
      schedulePhase: schedulePhase(source),
      trustLevel: source.trust_level,
    };
  }

  async eventsAfter(
    officeId: string,
    sequence: number,
  ): Promise<readonly OfficeRuntimeEvent[]> {
    const result = await this.pool.query<EventRow>(
      `SELECT id AS event_id, sequence AS event_sequence, event_type, payload_json, occurred_at
       FROM office_runtime_event
       WHERE office_id = $1 AND sequence > $2
       ORDER BY sequence ASC`,
      [officeId, sequence],
    );
    return result.rows.map((event) => ({
      eventId: event.event_id,
      occurredAt: event.occurred_at.toISOString(),
      payload: event.payload_json,
      sequence: asSequence(event.event_sequence),
      type: event.event_type,
    }));
  }
}
