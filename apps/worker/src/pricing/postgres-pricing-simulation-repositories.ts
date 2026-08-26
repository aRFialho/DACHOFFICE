import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { Money } from "@dachbyte-office/finance";
import type { PricingFeeAssumption } from "@dachbyte-office/pricing-agent";
import type {
  PricingCostFact,
  PricingListingFact,
  PricingProductFact,
  PricingSimulationFactsRepository,
  PricingSimulationTask,
  PricingSimulationTaskContextItem,
  PricingSimulationTaskRepository,
  PricingSimulationTaskTransaction,
} from "./pricing-simulation-task-handler.js";

type Row = Record<string, unknown>;
type Client = Pick<PoolClient, "query" | "release">;

export class PricingSimulationRepositoryError extends Error {
  readonly code = "pricing_simulation_repository_retryable";
  constructor() {
    super("pricing_simulation_repository_retryable");
  }
}

export class PostgresPricingSimulationFactsRepository implements PricingSimulationFactsRepository {
  constructor(private readonly pool: Pick<Pool, "connect">) {}

  async loadProducts(input: {
    officeId: string;
    skus: readonly string[];
  }): Promise<readonly PricingProductFact[]> {
    return this.read(async (client) => {
      const result = await client.query<Row>(
        `SELECT p.id AS product_id, p.sku, p.name, p.supplier_id
        FROM product p WHERE p.office_id = $1 AND p.active = true AND p.sku = ANY($2::text[])
        ORDER BY p.sku ASC, p.id ASC`,
        [input.officeId, input.skus],
      );
      return result.rows.flatMap((row) => {
        const productId = text(row.product_id),
          sku = skuText(row.sku),
          name = text(row.name);
        if (!productId || !sku || !name)
          throw new PricingSimulationRepositoryError();
        const supplierId = text(row.supplier_id);
        return [
          { productId, sku, name, ...(supplierId ? { supplierId } : {}) },
        ];
      });
    });
  }

  async loadCosts(input: {
    officeId: string;
    products: readonly PricingProductFact[];
    periodEnd: string;
  }): Promise<readonly PricingCostFact[]> {
    if (input.products.length === 0) return [];
    return this.read(async (client) => {
      const result = await client.query<Row>(
        `SELECT p.sku,
          CASE WHEN supplier_cost.id IS NOT NULL THEN 'supplier_table' ELSE 'canonical_cost' END AS source,
          COALESCE(supplier_cost.cost_numeric, canonical_cost.cost_numeric)::text AS cost,
          COALESCE(supplier_cost.currency, canonical_cost.currency) AS currency,
          COALESCE(supplier_cost.effective_at, canonical_cost.valid_at)::text AS effective_at,
          CASE WHEN supplier_cost.id IS NOT NULL THEN 'supplier-row:' || supplier_cost.id::text
               ELSE 'cost:' || canonical_cost.id::text END AS source_reference
        FROM product p
        LEFT JOIN LATERAL (
          SELECT r.id, r.cost_numeric, r.currency, t.effective_at
          FROM supplier_price_table_row r JOIN supplier_price_table t
            ON t.id = r.supplier_price_table_id AND t.office_id = r.office_id AND t.supplier_id = r.supplier_id
          WHERE r.office_id = p.office_id AND r.product_id = p.id AND r.supplier_id = p.supplier_id
            AND r.mapping_status = 'mapped' AND t.effective_at <= $3
          ORDER BY t.effective_at DESC, t.observed_at DESC, r.created_at DESC, r.id DESC LIMIT 1
        ) supplier_cost ON true
        LEFT JOIN LATERAL (
          SELECT c.id, c.cost_numeric, c.currency, c.valid_at FROM product_cost_snapshot c
          WHERE c.office_id = p.office_id AND c.product_id = p.id AND c.valid_at <= $3
          ORDER BY c.valid_at DESC, c.observed_at DESC, c.id DESC LIMIT 1
        ) canonical_cost ON supplier_cost.id IS NULL
        WHERE p.office_id = $1 AND p.id = ANY($2::uuid[])
          AND (supplier_cost.id IS NOT NULL OR canonical_cost.id IS NOT NULL)
        ORDER BY p.sku ASC`,
        [
          input.officeId,
          input.products.map((product) => product.productId),
          input.periodEnd,
        ],
      );
      return result.rows.map(costFact);
    });
  }

  async loadListings(input: {
    officeId: string;
    channel: string;
    skus: readonly string[];
    periodEnd: string;
  }): Promise<readonly PricingListingFact[]> {
    return this.read(async (client) => {
      const result = await client.query<Row>(
        `SELECT DISTINCT ON (p.sku) p.sku, l.id AS listing_id,
          COALESCE(l.current_promo_price_numeric, l.current_price_numeric)::text AS price, l.currency,
          l.observed_at::text AS observed_at, 'listing:' || l.id::text AS source_reference
        FROM product p JOIN channel_listing l ON l.product_id = p.id AND l.office_id = p.office_id
        WHERE p.office_id = $1 AND p.sku = ANY($2::text[]) AND l.channel = $3 AND l.observed_at <= $4
        ORDER BY p.sku ASC, l.observed_at DESC, l.updated_at DESC, l.id DESC`,
        [input.officeId, input.skus, input.channel, input.periodEnd],
      );
      return result.rows.map(listingFact);
    });
  }

  async loadFeeAssumptions(input: {
    officeId: string;
    channel: string;
    periodEnd: string;
  }): Promise<readonly PricingFeeAssumption[]> {
    return this.read(async (client) => {
      const result = await client.query<Row>(
        `SELECT r.id AS rule_id, r.component_type, r.payer, r.fee_mode,
          r.value_numeric::text AS value, r.currency, r.confidence, r.valid_from::text AS valid_from, r.valid_to::text AS valid_to
        FROM channel_fee_rule r WHERE r.office_id = $1 AND r.channel = $2
          AND (r.valid_from IS NULL OR r.valid_from <= $3) AND (r.valid_to IS NULL OR r.valid_to >= $3)
        ORDER BY r.valid_from DESC NULLS LAST, r.created_at DESC, r.id DESC`,
        [input.officeId, input.channel, input.periodEnd],
      );
      return result.rows.map(feeFact);
    });
  }

  private async read<T>(action: (client: Client) => Promise<T>): Promise<T> {
    let client: Client | undefined;
    try {
      client = await this.pool.connect();
      return await action(client);
    } catch (error) {
      if (error instanceof PricingSimulationRepositoryError) throw error;
      throw new PricingSimulationRepositoryError();
    } finally {
      client?.release();
    }
  }
}

export class PostgresPricingSimulationTaskRepository implements PricingSimulationTaskRepository {
  constructor(private readonly pool: Pick<Pool, "connect" | "query">) {}
  async isPricingSimulationTask(taskId: string): Promise<boolean> {
    const result = await this.pool.query(
      "SELECT 1 FROM task WHERE id = $1 AND type = 'pricing.simulation'",
      [taskId],
    );
    return result.rowCount === 1;
  }
  async inTransaction<T>(
    action: (transaction: PricingSimulationTaskTransaction) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await action(new Transaction(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

class Transaction implements PricingSimulationTaskTransaction {
  constructor(private readonly client: PoolClient) {}
  async loadTask(taskId: string): Promise<PricingSimulationTask | null> {
    const result = await this.client.query<Row>(
      `SELECT t.office_id, t.assigned_agent_id AS agent_id, t.status FROM task t
      JOIN agent a ON a.id = t.assigned_agent_id AND a.office_id = t.office_id
      WHERE t.id = $1 AND t.type = 'pricing.simulation' FOR UPDATE OF t, a`,
      [taskId],
    );
    const row = result.rows[0],
      officeId = text(row?.office_id),
      agentId = text(row?.agent_id),
      status = text(row?.status);
    return officeId && agentId && status ? { officeId, agentId, status } : null;
  }
  async loadContext(
    taskId: string,
  ): Promise<readonly PricingSimulationTaskContextItem[]> {
    const result = await this.client.query<Row>(
      "SELECT context_key, value_text FROM task_context_item WHERE task_id = $1 ORDER BY context_key ASC",
      [taskId],
    );
    return result.rows.flatMap((row) => {
      const key = text(row.context_key),
        value = text(row.value_text);
      return key && value ? [{ key, value }] : [];
    });
  }
  async authorize(input: {
    officeId: string;
    agentId: string;
    requestedAgentVersionId: string;
    requiredGrants: readonly string[];
  }): Promise<boolean> {
    const agent = await this.client.query<Row>(
      `SELECT a.lifecycle_status, a.active_version_id FROM agent a
      JOIN agent_version v ON v.id = a.active_version_id AND v.agent_id = a.id
      WHERE a.id = $1 AND a.office_id = $2 FOR UPDATE OF a`,
      [input.agentId, input.officeId],
    );
    const state = agent.rows[0];
    if (
      state?.lifecycle_status !== "active" ||
      state?.active_version_id !== input.requestedAgentVersionId
    )
      return false;
    const grants = await this.client.query<Row>(
      `SELECT tool_code, access_level FROM agent_tool_grant
      WHERE agent_id = $1 AND revoked_at IS NULL AND valid_from <= now() FOR SHARE`,
      [input.agentId],
    );
    const access = new Map(
      grants.rows.flatMap((row) => {
        const code = text(row.tool_code),
          level = text(row.access_level);
        return code && (level === "read" || level === "write")
          ? [[code, level] as const]
          : [];
      }),
    );
    return input.requiredGrants.every((code) =>
      code === "pricing.prepareAction"
        ? access.get(code) === "write"
        : access.get(code) === "read" || access.get(code) === "write",
    );
  }
  async claimDelivery(idempotencyKey: string): Promise<boolean> {
    const result = await this.client.query(
      "INSERT INTO worker_job_delivery (idempotency_key) VALUES ($1) ON CONFLICT DO NOTHING RETURNING idempotency_key",
      [idempotencyKey],
    );
    return result.rowCount === 1;
  }
  async persistReport(
    input: Parameters<PricingSimulationTaskTransaction["persistReport"]>[0],
  ) {
    const report = input.report,
      p = report.provenance;
    const inserted = await this.client.query<{ id: string }>(
      `INSERT INTO pricing_simulation_report
      (id, office_id, task_id, agent_id, agent_version_id, channel, period_start, period_end, filters_json, report_json, provenance_json, status, confidence, calculated_at, idempotency_key)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13,$14,$15)
      ON CONFLICT (office_id, task_id) DO NOTHING RETURNING id`,
      [
        randomUUID(),
        p.officeId,
        p.taskId,
        p.agentId,
        p.agentVersionId,
        p.channel,
        p.periodStart,
        p.periodEnd,
        JSON.stringify({
          skus: report.lines.map((line) => line.sku),
          discountPercent:
            report.lines[0]?.discountedPrice === undefined ? null : "scenario",
        }),
        JSON.stringify(report),
        JSON.stringify(p),
        report.status,
        report.confidence,
        input.calculatedAt,
        input.idempotencyKey,
      ],
    );
    if (inserted.rows[0]?.id)
      return { status: "created" as const, reportId: inserted.rows[0].id };
    const existing = await this.client.query<{
      id: string;
      report_json: unknown;
    }>(
      "SELECT id, report_json FROM pricing_simulation_report WHERE office_id = $1 AND task_id = $2 FOR SHARE",
      [p.officeId, p.taskId],
    );
    const row = existing.rows[0];
    return row && stableJson(row.report_json) === stableJson(report)
      ? { status: "unchanged" as const, reportId: row.id }
      : { status: "conflict" as const, reportId: row?.id ?? "" };
  }
  async persistPreparedActions(
    input: Parameters<
      PricingSimulationTaskTransaction["persistPreparedActions"]
    >[0],
  ): Promise<void> {
    for (const action of input.actions)
      await this.client.query(
        `INSERT INTO pricing_prepared_action
      (id, office_id, pricing_simulation_report_id, product_id, channel, currency, proposed_price_numeric, break_even_minimum_price_numeric, policy_decision, status, policy_evidence_json, idempotency_key)
      SELECT $1, report.office_id, report.id, $2, $3, $4, $5, $6, $7, 'prepared', $8::jsonb, $9
      FROM pricing_simulation_report report WHERE report.id = $10
      ON CONFLICT (office_id, pricing_simulation_report_id, product_id) DO NOTHING`,
        [
          randomUUID(),
          action.productId,
          action.channel,
          action.currency,
          action.proposedPrice,
          action.breakEvenMinimumPrice,
          action.policyDecision,
          JSON.stringify({ execution: "not_authorized", externalWrite: false }),
          `pricing-prepared:${input.reportId}:${action.productId}`,
          input.reportId,
        ],
      );
  }
  async completeTask(taskId: string): Promise<void> {
    const task = await this.client.query(
      "UPDATE task SET status = 'completed', completed_at = now() WHERE id = $1 AND status = 'queued' RETURNING id",
      [taskId],
    );
    if (task.rowCount !== 1)
      throw new Error("pricing_simulation_task_not_queued");
    for (const [sequence, from, to] of [
      [2, "queued", "assigned"],
      [3, "assigned", "executing"],
      [4, "executing", "completed"],
    ] as const)
      await this.client.query(
        "INSERT INTO task_event (id, task_id, sequence_number, event_type, from_status, to_status) VALUES ($1,$2,$3,$4,$5,$6)",
        [randomUUID(), taskId, sequence, `task.${to}`, from, to],
      );
  }
}

function costFact(row: Row): PricingCostFact {
  const sku = skuText(row.sku),
    source = row.source,
    cost = money(row.cost),
    currency = currencyText(row.currency),
    effectiveAt = time(row.effective_at),
    sourceReference = text(row.source_reference);
  if (
    !sku ||
    (source !== "supplier_table" && source !== "canonical_cost") ||
    !cost ||
    !currency ||
    !effectiveAt ||
    !sourceReference
  )
    throw new PricingSimulationRepositoryError();
  return {
    sku,
    cost: {
      status: "found",
      source,
      cost,
      currency,
      effectiveAt,
      sourceReference,
    },
  };
}
function listingFact(row: Row): PricingListingFact {
  const sku = skuText(row.sku),
    listingId = text(row.listing_id),
    price = money(row.price),
    currency = currencyText(row.currency),
    observedAt = time(row.observed_at),
    sourceReference = text(row.source_reference);
  if (
    !sku ||
    !listingId ||
    !price ||
    !currency ||
    !observedAt ||
    !sourceReference
  )
    throw new PricingSimulationRepositoryError();
  return {
    sku,
    listing: {
      status: "found",
      listingId,
      price,
      currency,
      observedAt,
      sourceReference,
    },
  };
}
function feeFact(row: Row): PricingFeeAssumption {
  const ruleId = text(row.rule_id),
    componentType = text(row.component_type),
    payer = text(row.payer),
    feeMode = row.fee_mode,
    value = money(row.value),
    confidence = row.confidence,
    validFrom = time(row.valid_from) ?? "1970-01-01T00:00:00.000Z",
    validTo = row.valid_to === null ? undefined : time(row.valid_to);
  const currency =
    row.currency === null ? undefined : currencyText(row.currency);
  if (
    !ruleId ||
    !componentType ||
    !payer ||
    (feeMode !== "percentage" && feeMode !== "fixed") ||
    !value ||
    (confidence !== "REAL" && confidence !== "ESTIMATED") ||
    (feeMode === "fixed" && !currency) ||
    (feeMode === "percentage" && currency)
  )
    throw new PricingSimulationRepositoryError();
  return {
    ruleId,
    componentType: componentType as PricingFeeAssumption["componentType"],
    payer: payer as PricingFeeAssumption["payer"],
    feeMode,
    value,
    confidence,
    validFrom,
    ...(currency ? { currency } : {}),
    ...(validTo ? { validTo } : {}),
  };
}
function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}
function skuText(value: unknown): string | null {
  const parsed = text(value);
  return parsed && /^[A-Z0-9][A-Z0-9._-]*$/.test(parsed) ? parsed : null;
}
function currencyText(value: unknown): string | null {
  const parsed = text(value);
  return parsed && /^[A-Z]{3}$/.test(parsed) ? parsed : null;
}
function money(value: unknown): Money | null {
  return typeof value === "string" &&
    /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(value)
    ? (`${value.split(".")[0]}.${(value.split(".")[1] ?? "").padEnd(4, "0")}` as Money)
    : null;
}
function time(value: unknown): string | null {
  const date = new Date(String(value));
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Row;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
