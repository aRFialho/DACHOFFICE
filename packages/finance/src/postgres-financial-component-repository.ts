import { randomUUID } from "node:crypto";
import {
  assertPersistFinancialComponentInput,
  type PersistFinancialComponentInput,
} from "./contracts.js";

export interface FinanceSqlClient {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Row[] }>;
  release(): void;
}
export interface FinanceSqlPool {
  connect(): Promise<FinanceSqlClient>;
}
export type PersistFinancialComponentResult =
  | { status: "persisted"; componentId: string }
  | { status: "already_exists"; componentId: string };

export class PostgresFinancialComponentRepository {
  constructor(private readonly options: { pool: FinanceSqlPool }) {}
  async persist(
    input: PersistFinancialComponentInput,
  ): Promise<PersistFinancialComponentResult> {
    const parsed = assertPersistFinancialComponentInput(input);
    return this.transaction(async (client) => {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO order_financial_component
          (id, office_id, order_header_id, order_item_id, component_type, payer, amount_numeric, currency, source, raw_code, source_reference, confidence, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (office_id, idempotency_key) DO NOTHING RETURNING id`,
        [
          randomUUID(),
          parsed.officeId,
          parsed.orderHeaderId,
          parsed.component.orderItemId ?? null,
          parsed.component.componentType,
          parsed.component.payer,
          parsed.component.amount,
          parsed.component.currency,
          parsed.component.source,
          parsed.component.rawCode ?? null,
          parsed.component.sourceReference ?? null,
          parsed.component.confidence,
          parsed.idempotencyKey,
        ],
      );
      const componentId = inserted.rows[0]?.id;
      if (componentId !== undefined)
        return { status: "persisted", componentId };
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM order_financial_component WHERE office_id = $1 AND idempotency_key = $2`,
        [parsed.officeId, parsed.idempotencyKey],
      );
      const existingId = existing.rows[0]?.id;
      if (existingId === undefined)
        throw new Error("financial_component_idempotency_conflict_missing");
      return { status: "already_exists", componentId: existingId };
    });
  }
  private async transaction<T>(
    operation: (client: FinanceSqlClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.options.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
