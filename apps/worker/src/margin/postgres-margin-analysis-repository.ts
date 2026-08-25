import { randomUUID } from "node:crypto";
import type {
  CanonicalCostLookup,
  MarginPeriodFilters,
  MarginPeriodReport,
  PersistedOrderMargin,
} from "@dachbyte-office/margin-agent";

type SqlRow = Record<string, unknown>;
type Money = string & { readonly __brand: "Money" };

export interface MarginAnalysisSqlClient {
  query<Row extends SqlRow = SqlRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Row[] }>;
  release(): void;
}

export interface MarginAnalysisSqlPool {
  connect(): Promise<MarginAnalysisSqlClient>;
}

export type LoadLatestSnapshotsInput = {
  officeId: string;
  periodStart: string;
  periodEnd: string;
  filters?: MarginPeriodFilters;
};

export type LoadCanonicalCostsInput = {
  officeId: string;
  orders: ReadonlyArray<Pick<PersistedOrderMargin, "orderId" | "skus">>;
};

export type PersistMarginAnalysisReportInput = {
  idempotencyKey: string;
  calculatedAt: string;
  report: MarginPeriodReport;
};

export type PersistMarginAnalysisReportResult =
  | { status: "created"; reportId: string }
  | { status: "unchanged"; reportId: string }
  | { status: "conflict"; reportId: string };

export type MarginAnalysisReportRead = {
  reportId: string;
  report: MarginPeriodReport;
  calculatedAt: string;
};

export class MarginAnalysisRepositoryError extends Error {
  readonly code = "margin_analysis_repository_retryable";

  constructor() {
    super("margin_analysis_repository_retryable");
  }
}

export class PostgresMarginAnalysisRepository {
  constructor(private readonly options: { pool: MarginAnalysisSqlPool }) {}

  async loadLatestSnapshots(
    input: LoadLatestSnapshotsInput,
  ): Promise<PersistedOrderMargin[]> {
    if (!validPeriod(input.periodStart, input.periodEnd)) return [];
    let client: MarginAnalysisSqlClient | undefined;
    try {
      client = await this.options.pool.connect();
      const result = await client.query(
        `WITH latest_snapshots AS (
           SELECT DISTINCT ON (s.order_header_id)
             s.id AS snapshot_id, s.order_header_id AS order_id, h.channel,
             h.ordered_at::text AS ordered_at,
             ARRAY(
               SELECT DISTINCT oi.external_sku
               FROM order_item oi
               WHERE oi.office_id = s.office_id
                 AND oi.order_header_id = s.order_header_id
                 AND oi.external_sku IS NOT NULL
               ORDER BY oi.external_sku
             ) AS skus,
             s.calculated_at::text AS snapshot_calculated_at,
             s.finance_rule_version_id, s.calculation_version, s.confidence,
             s.evidence_json->'revenue'->>'amount' AS revenue,
             s.cmv_numeric::text AS cmv, s.taxes_numeric::text AS taxes,
             s.marketplace_fees_numeric::text AS marketplace_fees,
             s.seller_discounts_numeric::text AS seller_discounts,
             s.logistics_numeric::text AS logistics,
             s.ads_cost_numeric::text AS ads_cost,
             s.other_costs_numeric::text AS other_costs,
             s.contribution_amount_numeric::text AS contribution_amount,
             s.contribution_percent_numeric::text AS contribution_percent,
             s.evidence_json
           FROM order_margin_snapshot s
           JOIN order_header h
             ON h.id = s.order_header_id AND h.office_id = s.office_id
           WHERE s.office_id = $1
             AND h.ordered_at >= $2
             AND h.ordered_at <= $3
             AND ($4::text[] IS NULL OR h.channel = ANY($4))
             AND ($5::text[] IS NULL OR EXISTS (
               SELECT 1 FROM order_item filter_item
               WHERE filter_item.office_id = s.office_id
                 AND filter_item.order_header_id = s.order_header_id
                 AND filter_item.external_sku = ANY($5)
             ))
           ORDER BY s.order_header_id, s.calculated_at DESC, s.id DESC
         )
         SELECT * FROM latest_snapshots
         ORDER BY ordered_at ASC, order_id ASC, snapshot_id ASC`,
        [
          input.officeId,
          input.periodStart,
          input.periodEnd,
          input.filters?.channels ?? null,
          input.filters?.skus ?? null,
        ],
      );
      return result.rows.flatMap(snapshotFromRow);
    } catch {
      throw new MarginAnalysisRepositoryError();
    } finally {
      client?.release();
    }
  }

  async loadCanonicalCosts(
    input: LoadCanonicalCostsInput,
  ): Promise<CanonicalCostLookup[]> {
    const requested = normalizedRequestedCosts(input.orders);
    if (requested.orderIds.length === 0) return [];
    let client: MarginAnalysisSqlClient | undefined;
    try {
      client = await this.options.pool.connect();
      const result = await client.query(
        `WITH requested_costs AS (
           SELECT requested.order_id, requested_skus.sku
           FROM unnest($2::uuid[]) AS requested(order_id)
           CROSS JOIN unnest($3::text[]) AS requested_skus(sku)
           WHERE EXISTS (
             SELECT 1 FROM order_item selected_item
             WHERE selected_item.office_id = $1
               AND selected_item.order_header_id = requested.order_id
               AND selected_item.external_sku = requested_skus.sku
           )
         )
         SELECT requested.order_id, requested.sku, item.product_id,
                cost.id AS cost_snapshot_id, cost.cost_numeric::text AS cost_numeric,
                cost.valid_at::text AS valid_at, cost.source_reference
         FROM requested_costs requested
         JOIN order_header h
           ON h.id = requested.order_id AND h.office_id = $1
         LEFT JOIN order_item item
           ON item.order_header_id = h.id AND item.office_id = h.office_id
          AND item.external_sku = requested.sku
         LEFT JOIN LATERAL (
           SELECT pcs.id, pcs.cost_numeric, pcs.valid_at, pcs.source_reference
           FROM product_cost_snapshot pcs
           WHERE pcs.office_id = h.office_id
             AND pcs.product_id = item.product_id
             AND pcs.valid_at <= h.ordered_at
           ORDER BY pcs.valid_at DESC, pcs.observed_at DESC, pcs.id DESC
           LIMIT 1
         ) cost ON true
         ORDER BY requested.order_id ASC, requested.sku ASC, item.product_id ASC NULLS FIRST`,
        [input.officeId, requested.orderIds, requested.skus],
      );
      return costsFromRows(requested.keys, result.rows);
    } catch {
      throw new MarginAnalysisRepositoryError();
    } finally {
      client?.release();
    }
  }

  async persistReport(
    input: PersistMarginAnalysisReportInput,
  ): Promise<PersistMarginAnalysisReportResult> {
    const facts = reportFacts(input);
    if (!facts) return { status: "conflict", reportId: "" };
    let client: MarginAnalysisSqlClient | undefined;
    try {
      client = await this.options.pool.connect();
      await client.query("BEGIN");
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO margin_analysis_report (
           id, office_id, task_id, agent_id, agent_version_id, period_start, period_end,
           filters_json, report_json, evidence_json, provenance_json, status, confidence,
           revenue_numeric, cmv_numeric, taxes_numeric, marketplace_fees_numeric,
           seller_discounts_numeric, logistics_numeric, ads_cost_numeric, other_costs_numeric,
           contribution_amount_numeric, contribution_percent_numeric, calculated_at, idempotency_key
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12, $13,
           $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25
         ) ON CONFLICT (office_id, task_id) DO NOTHING
         RETURNING id`,
        [randomUUID(), ...facts.insertValues],
      );
      const reportId = text(inserted.rows[0]?.id);
      if (reportId) {
        await client.query("COMMIT");
        return { status: "created", reportId };
      }
      const existing = await client.query(
        `SELECT id, agent_id, agent_version_id, period_start::text AS period_start,
                period_end::text AS period_end, filters_json, report_json, evidence_json,
                provenance_json, status, confidence, revenue_numeric::text AS revenue_numeric,
                cmv_numeric::text AS cmv_numeric, taxes_numeric::text AS taxes_numeric,
                marketplace_fees_numeric::text AS marketplace_fees_numeric,
                seller_discounts_numeric::text AS seller_discounts_numeric,
                logistics_numeric::text AS logistics_numeric, ads_cost_numeric::text AS ads_cost_numeric,
                other_costs_numeric::text AS other_costs_numeric,
                contribution_amount_numeric::text AS contribution_amount_numeric,
                contribution_percent_numeric::text AS contribution_percent_numeric,
                calculated_at::text AS calculated_at, idempotency_key
         FROM margin_analysis_report
         WHERE office_id = $1 AND task_id = $2
         FOR SHARE`,
        [facts.officeId, facts.taskId],
      );
      const existingRow = existing.rows[0];
      const existingId = text(existingRow?.id) ?? "";
      await client.query("COMMIT");
      return sameReportFacts(facts, existingRow)
        ? { status: "unchanged", reportId: existingId }
        : { status: "conflict", reportId: existingId };
    } catch {
      if (client !== undefined) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // The original storage failure remains the worker retry signal.
        }
      }
      throw new MarginAnalysisRepositoryError();
    } finally {
      client?.release();
    }
  }

  async getLatestReport(
    officeId: string,
    taskId: string,
  ): Promise<
    | { status: "found"; report: MarginAnalysisReportRead }
    | { status: "not_found" }
  > {
    let client: MarginAnalysisSqlClient | undefined;
    try {
      client = await this.options.pool.connect();
      const result = await client.query(
        `SELECT id, agent_id, agent_version_id, period_start::text AS period_start,
                period_end::text AS period_end, filters_json, report_json, evidence_json,
                provenance_json, status, confidence, revenue_numeric::text AS revenue_numeric,
                cmv_numeric::text AS cmv_numeric, taxes_numeric::text AS taxes_numeric,
                marketplace_fees_numeric::text AS marketplace_fees_numeric,
                seller_discounts_numeric::text AS seller_discounts_numeric,
                logistics_numeric::text AS logistics_numeric, ads_cost_numeric::text AS ads_cost_numeric,
                other_costs_numeric::text AS other_costs_numeric,
                contribution_amount_numeric::text AS contribution_amount_numeric,
                contribution_percent_numeric::text AS contribution_percent_numeric,
                calculated_at::text AS calculated_at, idempotency_key
         FROM margin_analysis_report
         WHERE office_id = $1 AND task_id = $2
         ORDER BY calculated_at DESC, id DESC
         LIMIT 1`,
        [officeId, taskId],
      );
      const report = latestReportFromRow(result.rows[0], officeId, taskId);
      return report ? { status: "found", report } : { status: "not_found" };
    } catch {
      throw new MarginAnalysisRepositoryError();
    } finally {
      client?.release();
    }
  }
}

function latestReportFromRow(
  row: SqlRow | undefined,
  officeId: string,
  taskId: string,
): MarginAnalysisReportRead | null {
  const reportId = text(row?.id);
  const calculatedAt = isoTimestamp(row?.calculated_at);
  const idempotencyKey = text(row?.idempotency_key);
  const report = marginPeriodReport(row?.report_json);
  if (!reportId || !calculatedAt || !idempotencyKey || !report) return null;
  const facts = reportFacts({ idempotencyKey, calculatedAt, report });
  if (!facts || facts.officeId !== officeId || facts.taskId !== taskId)
    return null;
  if (!sameReportFacts(facts, row)) return null;
  return { reportId, report, calculatedAt };
}

function marginPeriodReport(value: unknown): MarginPeriodReport | null {
  if (!isRecord(value)) return null;
  const status = reportStatus(value.status);
  const confidence = componentConfidence(value.confidence);
  const totals = marginDreTotals(value.totals);
  const orders = parsedArray(value.orders, marginOrderReport);
  const findings = parsedArray(value.findings, marginFinding);
  const evidence = marginEvidence(value.evidence);
  const provenance = marginProvenance(value.provenance);
  if (
    !status ||
    !confidence ||
    !totals ||
    !orders ||
    !findings ||
    !evidence ||
    !provenance
  )
    return null;
  return { status, confidence, totals, orders, findings, evidence, provenance };
}

function reportStatus(
  value: unknown,
): "completed" | "no_margin_snapshots" | null {
  return value === "completed" || value === "no_margin_snapshots"
    ? value
    : null;
}

function marginOrderReport(
  value: unknown,
): MarginPeriodReport["orders"][number] | null {
  if (!isRecord(value)) return null;
  const orderId = text(value.orderId);
  const channel = normalizedChannel(value.channel);
  const orderedAt = utcTimestamp(value.orderedAt);
  const skus = normalizedStringArray(value.skus, normalizedSku, true);
  const snapshotId = text(value.snapshotId);
  const snapshotCalculatedAt = utcTimestamp(value.snapshotCalculatedAt);
  const financeRuleVersionId = text(value.financeRuleVersionId);
  const calculationVersion = text(value.calculationVersion);
  const confidence = componentConfidence(value.confidence);
  const totals = marginDreTotals(value);
  const evidenceReferences = nonBlankStringArray(
    value.evidenceReferences,
    true,
  );
  const costs = parsedArray(value.costs, canonicalCostLookup);
  if (
    !orderId ||
    !channel ||
    !orderedAt ||
    !skus ||
    !snapshotId ||
    !snapshotCalculatedAt ||
    !financeRuleVersionId ||
    !calculationVersion ||
    !confidence ||
    !totals ||
    !evidenceReferences ||
    !costs
  )
    return null;
  return {
    orderId,
    channel,
    orderedAt,
    skus,
    snapshotId,
    snapshotCalculatedAt,
    financeRuleVersionId,
    calculationVersion,
    confidence,
    evidenceReferences,
    costs,
    ...totals,
  };
}

function canonicalCostLookup(
  value: unknown,
): MarginPeriodReport["orders"][number]["costs"][number] | null {
  if (!isRecord(value)) return null;
  const orderId = text(value.orderId);
  const sku = normalizedSku(value.sku);
  const evidenceReferences = nonBlankStringArray(
    value.evidenceReferences,
    false,
  );
  if (!orderId || !sku || !evidenceReferences) return null;
  if (value.status === "known") {
    const productId = text(value.productId);
    const cost = money(value.cost);
    const costVersionId = text(value.costVersionId);
    const validAt = utcTimestamp(value.validAt);
    if (!productId || !cost || !costVersionId || !validAt) return null;
    return {
      status: "known",
      orderId,
      sku,
      productId,
      cost,
      costVersionId,
      validAt,
      evidenceReferences,
    };
  }
  const reason = costReason(value.reason);
  if (value.status !== "unresolved" || !reason) return null;
  return { status: "unresolved", orderId, sku, reason, evidenceReferences };
}

function marginFinding(
  value: unknown,
): MarginPeriodReport["findings"][number] | null {
  if (!isRecord(value)) return null;
  if (value.type === "negative_contribution_margin") {
    const contributionAmount = money(value.contributionAmount);
    const contributionPercent = money(value.contributionPercent);
    if (value.scope !== "period" || !contributionAmount || !contributionPercent)
      return null;
    return {
      type: "negative_contribution_margin",
      scope: "period",
      contributionAmount,
      contributionPercent,
    };
  }
  if (value.type === "cost_unresolved") {
    const orderId = text(value.orderId);
    const sku = normalizedSku(value.sku);
    const reason = costReason(value.reason);
    if (!orderId || !sku || !reason) return null;
    return { type: "cost_unresolved", orderId, sku, reason };
  }
  return null;
}

function marginDreTotals(value: unknown): MarginPeriodReport["totals"] | null {
  if (!isRecord(value)) return null;
  const keys = [
    "revenue",
    "cmv",
    "taxes",
    "marketplaceFees",
    "sellerDiscounts",
    "logistics",
    "adsCost",
    "otherCosts",
    "contributionAmount",
    "contributionPercent",
  ] as const;
  const amounts = keys.map((key) => money(value[key]));
  if (amounts.some((amount) => amount === null)) return null;
  return {
    revenue: amounts[0]!,
    cmv: amounts[1]!,
    taxes: amounts[2]!,
    marketplaceFees: amounts[3]!,
    sellerDiscounts: amounts[4]!,
    logistics: amounts[5]!,
    adsCost: amounts[6]!,
    otherCosts: amounts[7]!,
    contributionAmount: amounts[8]!,
    contributionPercent: amounts[9]!,
  };
}

function marginEvidence(value: unknown): MarginPeriodReport["evidence"] | null {
  if (!isRecord(value)) return null;
  const unresolvedCosts = parsedArray(
    value.unresolvedCosts,
    unresolvedCostEvidence,
  );
  const consultations = parsedArray(value.consultations, financeConsultation);
  return unresolvedCosts && consultations
    ? { unresolvedCosts, consultations }
    : null;
}

function unresolvedCostEvidence(
  value: unknown,
): MarginPeriodReport["evidence"]["unresolvedCosts"][number] | null {
  if (!isRecord(value)) return null;
  const orderId = text(value.orderId);
  const sku = normalizedSku(value.sku);
  const reason = costReason(value.reason);
  const evidenceReferences = nonBlankStringArray(
    value.evidenceReferences,
    false,
  );
  return orderId && sku && reason && evidenceReferences
    ? { orderId, sku, reason, evidenceReferences }
    : null;
}

function financeConsultation(
  value: unknown,
): MarginPeriodReport["evidence"]["consultations"][number] | null {
  if (!isRecord(value)) return null;
  const consultationId = text(value.consultationId);
  const requestedAt = utcTimestamp(value.requestedAt);
  const evidenceReferences = nonBlankStringArray(
    value.evidenceReferences,
    true,
  );
  const reason =
    value.reason === "missing_classification" ||
    value.reason === "ambiguous_classification"
      ? value.reason
      : null;
  if (
    value.status !== "requested" ||
    !consultationId ||
    !requestedAt ||
    !reason ||
    !evidenceReferences
  )
    return null;
  return {
    consultationId,
    status: "requested",
    reason,
    requestedAt,
    evidenceReferences,
  };
}

function marginProvenance(
  value: unknown,
): MarginPeriodReport["provenance"] | null {
  if (!isRecord(value)) return null;
  const officeId = text(value.officeId);
  const taskId = text(value.taskId);
  const agentId = text(value.agentId);
  const agentVersionId = text(value.agentVersionId);
  const periodStart = utcTimestamp(value.periodStart);
  const periodEnd = utcTimestamp(value.periodEnd);
  const snapshotIds = nonBlankStringArray(value.snapshotIds, false);
  const financeRuleVersionIds = nonBlankStringArray(
    value.financeRuleVersionIds,
    false,
  );
  const calculationVersions = nonBlankStringArray(
    value.calculationVersions,
    false,
  );
  const snapshotCalculatedAts = timestampArray(value.snapshotCalculatedAts);
  const evidenceReferences = nonBlankStringArray(
    value.evidenceReferences,
    false,
  );
  const filters =
    value.filters === undefined ? undefined : marginFilters(value.filters);
  if (
    !officeId ||
    !taskId ||
    !agentId ||
    !agentVersionId ||
    !periodStart ||
    !periodEnd ||
    Date.parse(periodEnd) < Date.parse(periodStart) ||
    !snapshotIds ||
    !financeRuleVersionIds ||
    !calculationVersions ||
    !snapshotCalculatedAts ||
    !evidenceReferences ||
    (value.filters !== undefined && filters === null)
  )
    return null;
  if (filters === null) return null;
  const provenance = {
    officeId,
    taskId,
    agentId,
    agentVersionId,
    periodStart,
    periodEnd,
    snapshotIds,
    financeRuleVersionIds,
    calculationVersions,
    snapshotCalculatedAts,
    evidenceReferences,
  };
  return filters === undefined ? provenance : { ...provenance, filters };
}

function marginFilters(
  value: unknown,
): NonNullable<MarginPeriodReport["provenance"]["filters"]> | null {
  if (!isRecord(value)) return null;
  const channels =
    value.channels === undefined
      ? undefined
      : normalizedStringArray(value.channels, normalizedChannel, true);
  const skus =
    value.skus === undefined
      ? undefined
      : normalizedStringArray(value.skus, normalizedSku, true);
  if (channels === null || skus === null) return null;
  if (channels === undefined && skus === undefined) return null;
  return {
    ...(channels === undefined ? {} : { channels }),
    ...(skus === undefined ? {} : { skus }),
  };
}

function costReason(value: unknown): "missing_cost" | "ambiguous_cost" | null {
  return value === "missing_cost" || value === "ambiguous_cost" ? value : null;
}

function parsedArray<T>(
  value: unknown,
  parser: (value: unknown) => T | null,
): T[] | null {
  if (!Array.isArray(value)) return null;
  const parsed = value.map(parser);
  return parsed.every((item): item is T => item !== null) ? parsed : null;
}

function nonBlankStringArray(
  value: unknown,
  requireNonEmpty: boolean,
): string[] | null {
  if (!Array.isArray(value)) return null;
  const values = value.map(text);
  if (
    values.some((item) => item === null) ||
    (requireNonEmpty && values.length === 0)
  )
    return null;
  const parsed = values as string[];
  return new Set(parsed).size === parsed.length ? parsed : null;
}

function normalizedStringArray(
  value: unknown,
  parser: (value: unknown) => string | null,
  requireNonEmpty: boolean,
): string[] | null {
  if (!Array.isArray(value)) return null;
  const values = value.map(parser);
  if (
    values.some((item) => item === null) ||
    (requireNonEmpty && values.length === 0)
  )
    return null;
  const parsed = values as string[];
  return new Set(parsed).size === parsed.length ? parsed : null;
}

function timestampArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const values = value.map(utcTimestamp);
  if (values.some((item) => item === null)) return null;
  const parsed = values as string[];
  return new Set(parsed).size === parsed.length ? parsed : null;
}

function utcTimestamp(value: unknown): string | null {
  return typeof value === "string" && value.endsWith("Z")
    ? isoTimestamp(value)
    : null;
}
function snapshotFromRow(row: SqlRow): PersistedOrderMargin[] {
  const snapshotId = text(row.snapshot_id);
  const orderId = text(row.order_id);
  const channel = normalizedChannel(row.channel);
  const orderedAt = isoTimestamp(row.ordered_at);
  const skus = strings(row.skus, normalizedSku);
  const snapshotCalculatedAt = isoTimestamp(row.snapshot_calculated_at);
  const financeRuleVersionId = text(row.finance_rule_version_id);
  const calculationVersion = text(row.calculation_version);
  const confidence = componentConfidence(row.confidence);
  const evidence = isRecord(row.evidence_json) ? row.evidence_json : null;
  const amounts = [
    "revenue",
    "cmv",
    "taxes",
    "marketplace_fees",
    "seller_discounts",
    "logistics",
    "ads_cost",
    "other_costs",
    "contribution_amount",
    "contribution_percent",
  ].map((field) => money(row[field]));
  if (
    !snapshotId ||
    !orderId ||
    !channel ||
    !orderedAt ||
    !skus ||
    !snapshotCalculatedAt ||
    !financeRuleVersionId ||
    !calculationVersion ||
    !confidence ||
    !evidence ||
    amounts.some((amount) => amount === null)
  )
    return [];
  const [
    revenue,
    cmv,
    taxes,
    marketplaceFees,
    sellerDiscounts,
    logistics,
    adsCost,
    otherCosts,
    contributionAmount,
    contributionPercent,
  ] = amounts as [
    Money,
    Money,
    Money,
    Money,
    Money,
    Money,
    Money,
    Money,
    Money,
    Money,
  ];
  return [
    {
      snapshotId,
      orderId,
      channel,
      orderedAt,
      skus,
      snapshotCalculatedAt,
      financeRuleVersionId,
      calculationVersion,
      confidence,
      revenue,
      cmv,
      taxes,
      marketplaceFees,
      sellerDiscounts,
      logistics,
      adsCost,
      otherCosts,
      contributionAmount,
      contributionPercent,
      evidenceReferences: uniqueSorted([
        `snapshot:${snapshotId}`,
        ...sourceReferences(evidence),
      ]),
    },
  ];
}

type RequestedCosts = { orderIds: string[]; skus: string[]; keys: CostKey[] };
type CostKey = { orderId: string; sku: string };

function normalizedRequestedCosts(
  orders: LoadCanonicalCostsInput["orders"],
): RequestedCosts {
  const byKey = new Map<string, CostKey>();
  for (const order of orders) {
    if (!text(order.orderId)) continue;
    for (const sku of order.skus) {
      if (!normalizedSku(sku)) continue;
      byKey.set(JSON.stringify([order.orderId, sku]), {
        orderId: order.orderId,
        sku,
      });
    }
  }
  const keys = [...byKey.values()].sort(compareCostKeys);
  return {
    orderIds: uniqueSorted(keys.map((key) => key.orderId)),
    skus: uniqueSorted(keys.map((key) => key.sku)),
    keys,
  };
}

function costsFromRows(keys: CostKey[], rows: SqlRow[]): CanonicalCostLookup[] {
  const byKey = new Map<string, SqlRow[]>();
  for (const row of rows) {
    const orderId = text(row.order_id);
    const sku = normalizedSku(row.sku);
    if (!orderId || !sku) continue;
    const key = JSON.stringify([orderId, sku]);
    byKey.set(key, [...(byKey.get(key) ?? []), row]);
  }
  return keys.map((key) =>
    costFromCandidates(
      key,
      byKey.get(JSON.stringify([key.orderId, key.sku])) ?? [],
    ),
  );
}

function costFromCandidates(key: CostKey, rows: SqlRow[]): CanonicalCostLookup {
  const candidates = rows.filter((row) => text(row.product_id));
  const references = uniqueSorted(rows.flatMap(costEvidenceReferences));
  const productIds = uniqueSorted(
    candidates.map((row) => text(row.product_id)!).filter(Boolean),
  );
  if (productIds.length !== 1) {
    return unresolvedCost(
      key,
      productIds.length > 1 ? "ambiguous_cost" : "missing_cost",
      references,
    );
  }
  const costRows = candidates.filter((row) => text(row.cost_snapshot_id));
  if (costRows.length !== 1)
    return unresolvedCost(key, "missing_cost", references);
  const row = costRows[0]!;
  const productId = text(row.product_id)!;
  const costVersionId = text(row.cost_snapshot_id)!;
  const cost = money(row.cost_numeric);
  const validAt = isoTimestamp(row.valid_at);
  if (!cost || !validAt) return unresolvedCost(key, "missing_cost", references);
  return {
    status: "known",
    orderId: key.orderId,
    sku: key.sku,
    productId,
    cost,
    costVersionId,
    validAt,
    evidenceReferences: references,
  };
}

function unresolvedCost(
  key: CostKey,
  reason: "missing_cost" | "ambiguous_cost",
  references: string[],
): CanonicalCostLookup {
  return {
    status: "unresolved",
    orderId: key.orderId,
    sku: key.sku,
    reason,
    evidenceReferences:
      references.length === 0
        ? [`order-item:${key.orderId}:${key.sku}`]
        : references,
  };
}

function missingCosts(keys: CostKey[]): CanonicalCostLookup[] {
  return keys.map((key) => unresolvedCost(key, "missing_cost", []));
}

function costEvidenceReferences(row: SqlRow): string[] {
  const costId = text(row.cost_snapshot_id);
  const sourceReference = text(row.source_reference);
  return uniqueSorted([
    ...(costId ? [`cost:${costId}`] : []),
    ...(sourceReference ? [sourceReference] : []),
  ]);
}

type ReportFacts = {
  officeId: string;
  taskId: string;
  insertValues: unknown[];
  comparable: Record<string, unknown>;
};

function reportFacts(
  input: PersistMarginAnalysisReportInput,
): ReportFacts | null {
  const report = input.report;
  const provenance = report?.provenance;
  const totals = report?.totals;
  const officeId = text(provenance?.officeId);
  const taskId = text(provenance?.taskId);
  const agentId = text(provenance?.agentId);
  const agentVersionId = text(provenance?.agentVersionId);
  const periodStart = isoTimestamp(provenance?.periodStart);
  const periodEnd = isoTimestamp(provenance?.periodEnd);
  const calculatedAt = isoTimestamp(input.calculatedAt);
  const idempotencyKey = boundedKey(input.idempotencyKey);
  const status =
    report?.status === "completed" || report?.status === "no_margin_snapshots"
      ? report.status
      : null;
  const confidence = componentConfidence(report?.confidence);
  const amountKeys = [
    "revenue",
    "cmv",
    "taxes",
    "marketplaceFees",
    "sellerDiscounts",
    "logistics",
    "adsCost",
    "otherCosts",
    "contributionAmount",
    "contributionPercent",
  ] as const;
  const amounts = amountKeys.map((key) => money(totals?.[key]));
  if (
    !officeId ||
    !taskId ||
    !agentId ||
    !agentVersionId ||
    !periodStart ||
    !periodEnd ||
    !calculatedAt ||
    !idempotencyKey ||
    !status ||
    !confidence ||
    amounts.some((amount) => amount === null) ||
    !isRecord(report.evidence) ||
    !isRecord(provenance) ||
    Date.parse(periodEnd) < Date.parse(periodStart)
  )
    return null;
  const filters = provenance.filters === undefined ? {} : provenance.filters;
  if (!isRecord(filters)) return null;
  const comparable = {
    agent_id: agentId,
    agent_version_id: agentVersionId,
    period_start: periodStart,
    period_end: periodEnd,
    filters_json: filters,
    report_json: report,
    evidence_json: report.evidence,
    provenance_json: provenance,
    status,
    confidence,
    revenue_numeric: amounts[0],
    cmv_numeric: amounts[1],
    taxes_numeric: amounts[2],
    marketplace_fees_numeric: amounts[3],
    seller_discounts_numeric: amounts[4],
    logistics_numeric: amounts[5],
    ads_cost_numeric: amounts[6],
    other_costs_numeric: amounts[7],
    contribution_amount_numeric: amounts[8],
    contribution_percent_numeric: amounts[9],
    calculated_at: calculatedAt,
    idempotency_key: idempotencyKey,
  };
  return {
    officeId,
    taskId,
    comparable,
    insertValues: [
      officeId,
      taskId,
      ...Object.values(comparable).map((value) =>
        isRecord(value) || Array.isArray(value) ? JSON.stringify(value) : value,
      ),
    ],
  };
}

function sameReportFacts(
  expected: ReportFacts,
  row: SqlRow | undefined,
): boolean {
  if (!row) return false;
  return Object.entries(expected.comparable).every(([key, value]) => {
    const actual = row[key];
    if (key.endsWith("_json")) return stableJson(value) === stableJson(actual);
    if (key.endsWith("_at") || key === "period_start" || key === "period_end")
      return isoTimestamp(actual) === value;
    return actual === value;
  });
}

function validPeriod(periodStart: string, periodEnd: string): boolean {
  const start = isoTimestamp(periodStart);
  const end = isoTimestamp(periodEnd);
  return !!start && !!end && Date.parse(end) >= Date.parse(start);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function money(value: unknown): Money | null {
  if (
    typeof value !== "string" ||
    !/^-?(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(value)
  )
    return null;
  const [whole, fraction] = value.split(".");
  return `${whole}.${(fraction ?? "").padEnd(4, "0")}` as Money;
}

function isoTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function componentConfidence(value: unknown): "REAL" | "ESTIMATED" | null {
  return value === "REAL" || value === "ESTIMATED" ? value : null;
}

function normalizedChannel(value: unknown): string | null {
  return typeof value === "string" && /^[a-z0-9][a-z0-9_-]*$/.test(value)
    ? value
    : null;
}

function normalizedSku(value: unknown): string | null {
  return typeof value === "string" && /^[A-Z0-9][A-Z0-9._-]*$/.test(value)
    ? value
    : null;
}

function strings(
  value: unknown,
  validator: (value: unknown) => string | null,
): string[] | null {
  if (!Array.isArray(value)) return null;
  const values = value.map(validator);
  return values.length > 0 &&
    values.every((item): item is string => item !== null) &&
    new Set(values).size === values.length
    ? values.sort((left, right) => left.localeCompare(right))
    : null;
}

function sourceReferences(value: Record<string, unknown>): string[] {
  const references: string[] = [];
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) candidate.forEach(visit);
    else if (isRecord(candidate)) {
      const reference =
        text(candidate.sourceReference) ?? text(candidate.source_reference);
      if (reference) references.push(reference);
      Object.values(candidate).forEach(visit);
    }
  };
  visit(value);
  return uniqueSorted(references);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function compareCostKeys(left: CostKey, right: CostKey): number {
  return (
    left.orderId.localeCompare(right.orderId) ||
    left.sku.localeCompare(right.sku)
  );
}

function boundedKey(value: unknown): string | null {
  const parsed = text(value);
  return parsed && parsed.length <= 200 ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
