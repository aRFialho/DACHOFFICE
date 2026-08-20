import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type {
  CreateDepartmentInput,
  CreateOfficeInput,
  DepartmentRecord,
  OfficeRecord,
  OfficeRepository,
} from './office-service.js';

export class PostgresOfficeRepository implements OfficeRepository {
  constructor(private readonly pool: Pool) {}

  async createOffice(input: CreateOfficeInput): Promise<OfficeRecord> {
    const id = randomUUID();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO office (id, name, timezone, trust_level)
         VALUES ($1, $2, $3, $4)`,
        [id, input.name, input.timezone, input.trustLevel],
      );
      await client.query(
        `INSERT INTO office_settings (office_id, workday_start, workday_end, updated_by_user_id)
         VALUES ($1, $2, $3, $4)`,
        [id, input.workdayStart, input.workdayEnd, input.createdByUserId],
      );
      await client.query('COMMIT');
      return { id, ...input };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async createDepartment(input: CreateDepartmentInput): Promise<DepartmentRecord> {
    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO department (id, office_id, name, type)
       VALUES ($1, $2, $3, $4)`,
      [id, input.officeId, input.name, input.type],
    );
    return { id, ...input };
  }
}
