import { describe, expect, it } from "vitest";
import type { IdempotencyKey, Money } from "../src/contracts.js";
import {
  PostgresFinancialComponentRepository,
  type FinanceSqlClient,
  type FinanceSqlPool,
} from "../src/postgres-financial-component-repository.js";

type Query = { text: string; values?: readonly unknown[] };

class RecordingClient implements FinanceSqlClient {
  readonly queries: Query[] = [];

  constructor(private readonly conflicts = false) {}

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Row[] }> {
    this.queries.push({ text, ...(values === undefined ? {} : { values }) });
    if (text.includes("INSERT INTO order_financial_component")) {
      return {
        rows: this.conflicts
          ? []
          : ([{ id: "component-1" }] as unknown as Row[]),
      };
    }
    if (text.includes("SELECT id FROM order_financial_component")) {
      return { rows: [{ id: "component-existing" }] as unknown as Row[] };
    }
    return { rows: [] };
  }

  release(): void {}
}

class RecordingPool implements FinanceSqlPool {
  readonly client: RecordingClient;

  constructor(conflicts = false) {
    this.client = new RecordingClient(conflicts);
  }

  async connect(): Promise<FinanceSqlClient> {
    return this.client;
  }
}

const input = {
  officeId: "office-1",
  orderHeaderId: "order-1",
  idempotencyKey: "component:order-1:fee-17" as IdempotencyKey,
  component: {
    amount: "12.5000" as Money,
    currency: "BRL",
    componentType: "marketplace_commission" as const,
    payer: "marketplace" as const,
    source: "provider '; DROP TABLE order_financial_component; --",
    rawCode: "sale_fee",
    sourceReference: "fee-17",
    confidence: "REAL" as const,
  },
};

describe("PostgresFinancialComponentRepository", () => {
  it("parameterizes provenance and records every financial component field", async () => {
    const pool = new RecordingPool();
    const repository = new PostgresFinancialComponentRepository({ pool });

    await expect(repository.persist(input)).resolves.toEqual({
      status: "persisted",
      componentId: "component-1",
    });

    const insert = pool.client.queries.find((query) =>
      query.text.includes("INSERT INTO order_financial_component"),
    );
    expect(insert?.text).toContain("ON CONFLICT (office_id, idempotency_key)");
    expect(insert?.text).not.toContain(input.component.source);
    expect(insert?.values).toEqual(
      expect.arrayContaining([
        input.component.payer,
        input.component.source,
        input.component.rawCode,
        input.component.confidence,
        input.idempotencyKey,
      ]),
    );
  });

  it("returns the tenant-scoped existing component when the idempotency key conflicts", async () => {
    const pool = new RecordingPool(true);
    const repository = new PostgresFinancialComponentRepository({ pool });

    await expect(repository.persist(input)).resolves.toEqual({
      status: "already_exists",
      componentId: "component-existing",
    });

    const lookup = pool.client.queries.find((query) =>
      query.text.includes("SELECT id FROM order_financial_component"),
    );
    expect(lookup?.values).toEqual([input.officeId, input.idempotencyKey]);
  });
});
