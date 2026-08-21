import { describe, expect, it } from "vitest";
import {
  PostgresCatalogRepository,
  type CatalogSqlClient,
  type CatalogSqlPool,
  type PersistCatalogItemInput,
} from "../src/postgres-catalog-repository.js";

type MappingRow = {
  id: string;
  status: "mapped";
  product_id: string;
  resolution_reason: null;
};

class ConcurrentMappingPool implements CatalogSqlPool {
  readonly mappingInserts: string[] = [];
  private mapping: MappingRow | undefined;
  private owner: ScriptedClient | undefined;
  private waiters: (() => void)[] = [];

  async connect(): Promise<CatalogSqlClient> {
    return new ScriptedClient(this);
  }

  async acquire(client: ScriptedClient): Promise<void> {
    if (this.owner === undefined) {
      this.owner = client;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.owner = client;
  }

  releaseLock(client: ScriptedClient): void {
    if (this.owner !== client) return;
    this.owner = undefined;
    this.waiters.shift()?.();
  }

  lookupMapping(): MappingRow | undefined {
    return this.mapping;
  }

  insertMapping(values: readonly unknown[] | undefined): void {
    if (this.mapping) throw new Error("unique_external_identity_conflict");
    this.mapping = {
      id: values?.[0] as string,
      status: "mapped",
      product_id: values?.[7] as string,
      resolution_reason: null,
    };
    this.mappingInserts.push(this.mapping.id);
  }
}

class ScriptedClient implements CatalogSqlClient {
  private locked = false;

  constructor(private readonly pool: ConcurrentMappingPool) {}

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Row[] }> {
    if (text === "BEGIN") return { rows: [] };
    if (text === "COMMIT" || text === "ROLLBACK") {
      if (this.locked) this.pool.releaseLock(this);
      return { rows: [] };
    }
    if (text.includes("pg_advisory_xact_lock")) {
      await this.pool.acquire(this);
      this.locked = true;
      return { rows: [] };
    }
    if (text.includes("FROM external_product_mapping")) {
      const mapping = this.pool.lookupMapping();
      return { rows: mapping === undefined ? [] : [mapping as unknown as Row] };
    }
    if (text.includes("SELECT id FROM product")) {
      return { rows: [{ id: "canonical-product-17" } as unknown as Row] };
    }
    if (text.includes("INSERT INTO external_product_mapping")) {
      this.pool.insertMapping(values);
      return { rows: [] };
    }
    return { rows: [] };
  }

  release(): void {}
}

const input: PersistCatalogItemInput = {
  run: {
    id: "run-1",
    officeId: "office-1",
    integrationId: "integration-1",
    provider: "tray",
    observedAt: new Date("2026-08-21T12:00:00.000Z"),
    checkpointCursor: undefined,
    pagesSeen: 0,
    itemsSeen: 0,
    mappedCount: 0,
    unresolvedCount: 0,
  },
  provider: "tray",
  item: {
    externalProductId: "tray-product-17",
    externalSku: "SKU-017",
    price: "19.90",
    costPrice: "10.0000",
    status: "active",
    observedAt: new Date("2026-08-21T12:00:00.000Z"),
  },
};

describe("PostgresCatalogRepository", () => {
  it("serializes first-seen external identity persistence so concurrent syncs reuse one mapping", async () => {
    const pool = new ConcurrentMappingPool();
    const repository = new PostgresCatalogRepository({ pool, currency: "BRL" });

    const results = await Promise.all([
      repository.persistItem(input),
      repository.persistItem({ ...input, run: { ...input.run, id: "run-2" } }),
    ]);

    expect(results).toEqual([
      { status: "mapped", productId: "canonical-product-17" },
      { status: "mapped", productId: "canonical-product-17" },
    ]);
    expect(pool.mappingInserts).toHaveLength(1);
  });
});
