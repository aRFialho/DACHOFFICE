import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { AgentRecord, AgentRepository, CreateAgentInput } from './agent-service.js';

export class PostgresAgentRepository implements AgentRepository {
  constructor(private readonly pool: Pool) {}

  async createAgent(input: CreateAgentInput): Promise<AgentRecord> {
    const agentId = randomUUID();
    const versionId = randomUUID();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const department = await client.query(
        'SELECT 1 FROM department WHERE id = $1 AND office_id = $2',
        [input.departmentId, input.officeId],
      );
      if (department.rowCount !== 1) throw new Error('department does not belong to office');

      await client.query(
        `INSERT INTO agent (
          id, office_id, department_id, name, title, primary_role, lifecycle_status,
          current_state, created_by_user_id
        ) VALUES ($1, $2, $3, $4, $5, $6, 'draft', 'idle', $7)`,
        [agentId, input.officeId, input.departmentId, input.name, input.title, input.primaryRole, input.createdByUserId],
      );
      await client.query(
        `INSERT INTO agent_version (
          id, agent_id, version_number, base_prompt, mission, communication_style,
          responsibilities_json, restrictions_json, model_profile, trust_ceiling, change_type,
          created_by_user_id
        ) VALUES ($1, $2, 1, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, 'hard', $10)`,
        [
          versionId,
          agentId,
          input.basePrompt,
          input.mission,
          input.communicationStyle,
          JSON.stringify(input.responsibilities),
          JSON.stringify(input.restrictions),
          input.modelProfile,
          input.trustCeiling,
          input.createdByUserId,
        ],
      );
      await client.query('UPDATE agent SET active_version_id = $1 WHERE id = $2', [versionId, agentId]);

      for (const schedule of input.schedules) {
        await client.query(
          `INSERT INTO agent_schedule (agent_id, weekday, work_start, work_end, timezone, on_call)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [agentId, schedule.weekday, schedule.workStart, schedule.workEnd, schedule.timezone, schedule.onCall],
        );
      }
      for (const grant of input.grants) {
        await client.query(
          `INSERT INTO agent_tool_grant (id, agent_id, tool_code, access_level)
           VALUES ($1, $2, $3, $4)`,
          [randomUUID(), agentId, grant.toolCode, grant.accessLevel],
        );
      }
      await client.query('COMMIT');
      return { id: agentId, lifecycleStatus: 'draft', versionNumber: 1, ...input };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
