import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { AgentScheduleInput } from './agent-service.js';
import type {
  AgentLifecycleRepository,
  AgentVersionRecord,
  AppendAgentVersionInput,
} from './agent-lifecycle-service.js';
import type { AgentLifecycleStatus } from './write-gate.js';

type AgentRow = { lifecycle_status: AgentLifecycleStatus };
type VersionRow = { version_number: number };

const recordAudit = async (
  client: PoolClient,
  actorUserId: string,
  action: string,
  targetType: string,
  targetId: string,
  metadata: Record<string, unknown>,
): Promise<void> => {
  await client.query(
    `INSERT INTO audit_log (id, actor_user_id, action, target_type, target_id, outcome, metadata_json)
     VALUES ($1, $2, $3, $4, $5, 'success', $6::jsonb)`,
    [randomUUID(), actorUserId, action, targetType, targetId, JSON.stringify(metadata)],
  );
};

export class PostgresAgentLifecycleRepository implements AgentLifecycleRepository {
  constructor(private readonly pool: Pool) {}

  async appendVersion(input: AppendAgentVersionInput): Promise<AgentVersionRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query<AgentRow>(
        'SELECT lifecycle_status FROM agent WHERE id = $1 FOR UPDATE',
        [input.agentId],
      );
      if (agent.rowCount !== 1 || agent.rows[0]?.lifecycle_status === 'archived') {
        throw new Error('agent cannot receive a version');
      }
      const number = await client.query<VersionRow>(
        'SELECT COALESCE(MAX(version_number), 0) + 1 AS version_number FROM agent_version WHERE agent_id = $1',
        [input.agentId],
      );
      const versionNumber = number.rows[0]?.version_number;
      if (!versionNumber) throw new Error('agent version number is unavailable');
      const versionId = randomUUID();
      await client.query(
        `INSERT INTO agent_version (
          id, agent_id, version_number, base_prompt, mission, communication_style,
          responsibilities_json, restrictions_json, model_profile, trust_ceiling, change_type,
          created_by_user_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12)`,
        [
          versionId,
          input.agentId,
          versionNumber,
          input.basePrompt,
          input.mission,
          input.communicationStyle,
          JSON.stringify(input.responsibilities),
          JSON.stringify(input.restrictions),
          input.modelProfile,
          input.trustCeiling,
          input.changeType,
          input.createdByUserId,
        ],
      );
      await client.query('UPDATE agent SET active_version_id = $1, updated_at = now() WHERE id = $2', [versionId, input.agentId]);
      await recordAudit(client, input.createdByUserId, 'agent_version_appended', 'agent', input.agentId, {
        versionNumber,
        changeType: input.changeType,
      });
      await client.query('COMMIT');
      return { id: versionId, versionNumber, ...input };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async transitionLifecycle(
    agentId: string,
    allowedFrom: readonly AgentLifecycleStatus[],
    target: AgentLifecycleStatus,
    changedByUserId: string,
  ): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `UPDATE agent SET lifecycle_status = $3, updated_at = now()
         WHERE id = $1 AND lifecycle_status = ANY($2::text[])`,
        [agentId, allowedFrom, target],
      );
      if (result.rowCount !== 1) {
        await client.query('ROLLBACK');
        return false;
      }
      await recordAudit(client, changedByUserId, 'agent_lifecycle_transitioned', 'agent', agentId, { target });
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async replaceSchedule(
    agentId: string,
    schedules: readonly AgentScheduleInput[],
    changedByUserId: string,
  ): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query('SELECT 1 FROM agent WHERE id = $1 FOR UPDATE', [agentId]);
      if (agent.rowCount !== 1) {
        await client.query('ROLLBACK');
        return false;
      }
      await client.query('DELETE FROM agent_schedule WHERE agent_id = $1', [agentId]);
      for (const schedule of schedules) {
        await client.query(
          `INSERT INTO agent_schedule (agent_id, weekday, work_start, work_end, timezone, on_call)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [agentId, schedule.weekday, schedule.workStart, schedule.workEnd, schedule.timezone, schedule.onCall],
        );
      }
      await recordAudit(client, changedByUserId, 'agent_schedule_replaced', 'agent', agentId, { days: schedules.length });
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async revokeGrant(agentId: string, grantId: string, revokedByUserId: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `UPDATE agent_tool_grant SET revoked_at = now()
         WHERE id = $1 AND agent_id = $2 AND revoked_at IS NULL`,
        [grantId, agentId],
      );
      if (result.rowCount !== 1) {
        await client.query('ROLLBACK');
        return false;
      }
      await recordAudit(client, revokedByUserId, 'agent_tool_grant_revoked', 'agent_tool_grant', grantId, { agentId });
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
