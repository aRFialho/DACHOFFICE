import { randomUUID } from "node:crypto";
import type {
  FinanceMarginSnapshotRead,
  FinanceRuleVersionRead,
  ConfiguredChannelFeeRule,
  CreateFinanceRuleVersionInput,
  FinanceService,
} from "./finance-service.js";

type SqlRow = Record<string, unknown>;

export interface FinanceSqlClient {
  query(text: string, values?: readonly unknown[]): Promise<{ rows: SqlRow[] }>;
  release(): void;
}

export interface FinanceSqlPool {
  connect(): Promise<FinanceSqlClient>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

const confidence = (value: unknown): "REAL" | "ESTIMATED" | null =>
  value === "REAL" || value === "ESTIMATED" ? value : null;

const ruleVersion = (row: SqlRow): FinanceRuleVersionRead | null => {
  const id = text(row.id);
  const ruleSetId = text(row.rule_set_id);
  const createdAt = text(row.created_at);
  const rulesJson = row.rules_json;
  if (
    !id ||
    !ruleSetId ||
    !createdAt ||
    !Number.isSafeInteger(row.version) ||
    (row.version as number) <= 0 ||
    !isRecord(rulesJson)
  )
    return null;
  return {
    id,
    ruleSetId,
    version: row.version as number,
    rulesJson: {
      rawCodeMappings: isRecord(rulesJson.rawCodeMappings)
        ? rulesJson.rawCodeMappings
        : {},
    },
    createdAt,
  };
};

const marginSnapshot = (row: SqlRow): FinanceMarginSnapshotRead | null => {
  const id = text(row.id);
  const financeRuleVersionId = text(row.finance_rule_version_id);
  const revenueBasis = text(row.revenue_basis);
  const cmv = text(row.cmv);
  const taxes = text(row.taxes);
  const marketplaceFees = text(row.marketplace_fees);
  const sellerDiscounts = text(row.seller_discounts);
  const logistics = text(row.logistics);
  const adsCost = text(row.ads_cost);
  const otherCosts = text(row.other_costs);
  const contributionAmount = text(row.contribution_amount);
  const contributionPercent = text(row.contribution_percent);
  const calculationVersion = text(row.calculation_version);
  const calculatedAt = text(row.calculated_at);
  const resultConfidence = confidence(row.confidence);
  if (
    !id ||
    !financeRuleVersionId ||
    !revenueBasis ||
    !cmv ||
    !taxes ||
    !marketplaceFees ||
    !sellerDiscounts ||
    !logistics ||
    !adsCost ||
    !otherCosts ||
    !contributionAmount ||
    !contributionPercent ||
    !calculationVersion ||
    !calculatedAt ||
    !resultConfidence ||
    !isRecord(row.evidence)
  )
    return null;
  return {
    id,
    financeRuleVersionId,
    revenueBasis,
    cmv,
    taxes,
    marketplaceFees,
    sellerDiscounts,
    logistics,
    adsCost,
    otherCosts,
    contributionAmount,
    contributionPercent,
    confidence: resultConfidence,
    calculationVersion,
    calculatedAt,
    evidence: row.evidence,
  };
};

const stableJson = (value: unknown): string => {
  if (Array.isArray(value))
    return `[${value.map(stableJson).sort().join(",")}]`;
  if (isRecord(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
};

const isoDate = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
};

const canonicalFee = (fee: ConfiguredChannelFeeRule) => ({
  channel: fee.channel,
  componentType: fee.componentType,
  payer: fee.payer,
  feeMode: fee.feeMode,
  value: fee.value,
  currency: fee.currency ?? null,
  source: fee.source,
  rawCode: fee.rawCode ?? null,
  confidence: fee.confidence,
  validFrom: isoDate(fee.validFrom),
  validTo: isoDate(fee.validTo),
});

const sameConfiguration = (
  input: CreateFinanceRuleVersionInput,
  existing: SqlRow,
  existingFees: readonly SqlRow[],
): boolean => {
  const actualRules = isRecord(existing.rules_json) ? existing.rules_json : {};
  const actualFees = existingFees.map((fee) => ({
    channel: fee.channel,
    componentType: fee.component_type,
    payer: fee.payer,
    feeMode: fee.fee_mode,
    value: fee.value_numeric,
    currency: fee.currency ?? null,
    source: fee.source,
    rawCode: fee.raw_code ?? null,
    confidence: fee.confidence,
    validFrom: isoDate(fee.valid_from),
    validTo: isoDate(fee.valid_to),
  }));
  return (
    stableJson(input.rulesJson) === stableJson(actualRules) &&
    stableJson(input.channelFeeRules.map(canonicalFee)) ===
      stableJson(actualFees)
  );
};
const isRuleVersionUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  "constraint" in error &&
  (error as { code?: unknown }).code === "23505" &&
  (error as { constraint?: unknown }).constraint ===
    "finance_rule_version_rule_set_id_version_key";
export class PostgresFinanceRepository implements FinanceService {
  constructor(private readonly pool: FinanceSqlPool) {}

  async getLatestRuleVersion(officeId: string) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT id, rule_set_id, version, rules_json, created_at::text
         FROM finance_rule_version
         WHERE office_id = $1
         ORDER BY created_at DESC, version DESC, id DESC
         LIMIT 1`,
        [officeId],
      );
      const parsed = result.rows[0] && ruleVersion(result.rows[0]);
      return parsed
        ? { status: "found" as const, ruleVersion: parsed }
        : { status: "not_found" as const };
    } catch {
      return { status: "not_found" as const };
    } finally {
      client.release();
    }
  }

  async getLatestMarginSnapshot(officeId: string, orderHeaderId: string) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT id, finance_rule_version_id, revenue_basis,
                cmv_numeric::text AS cmv, taxes_numeric::text AS taxes,
                marketplace_fees_numeric::text AS marketplace_fees,
                seller_discounts_numeric::text AS seller_discounts,
                logistics_numeric::text AS logistics, ads_cost_numeric::text AS ads_cost,
                other_costs_numeric::text AS other_costs,
                contribution_amount_numeric::text AS contribution_amount,
                contribution_percent_numeric::text AS contribution_percent,
                confidence, calculation_version, calculated_at::text,
                evidence_json AS evidence
         FROM order_margin_snapshot
         WHERE office_id = $1 AND order_header_id = $2
         ORDER BY calculated_at DESC, id DESC
         LIMIT 1`,
        [officeId, orderHeaderId],
      );
      const parsed = result.rows[0] && marginSnapshot(result.rows[0]);
      return parsed
        ? { status: "found" as const, snapshot: parsed }
        : { status: "not_found" as const };
    } catch {
      return { status: "not_found" as const };
    } finally {
      client.release();
    }
  }

  private async existingConfigurationResult(
    client: FinanceSqlClient,
    input: CreateFinanceRuleVersionInput,
  ): Promise<{ status: "unchanged" } | { status: "conflict" } | null> {
    const existing = await client.query(
      `SELECT id, rules_json
       FROM finance_rule_version
       WHERE office_id = $1 AND rule_set_id = $2 AND version = $3
       FOR UPDATE`,
      [input.officeId, input.ruleSetId, input.version],
    );
    const existingVersion = existing.rows[0];
    if (!existingVersion) return null;
    const feeRules = await client.query(
      `SELECT channel, component_type, payer, fee_mode, value_numeric::text AS value_numeric,
              currency, source, raw_code, confidence, valid_from, valid_to
       FROM channel_fee_rule
       WHERE office_id = $1 AND finance_rule_version_id = $2
       ORDER BY id ASC`,
      [input.officeId, existingVersion.id],
    );
    return sameConfiguration(input, existingVersion, feeRules.rows)
      ? { status: "unchanged" }
      : { status: "conflict" };
  }

  async createRuleVersion(input: CreateFinanceRuleVersionInput) {
    const client = await this.pool.connect();
    let insertingRuleVersion = false;
    try {
      await client.query("BEGIN");
      const existingResult = await this.existingConfigurationResult(
        client,
        input,
      );
      if (existingResult) {
        await client.query("COMMIT");
        return existingResult;
      }

      const ruleVersionId = randomUUID();
      insertingRuleVersion = true;
      await client.query(
        `INSERT INTO finance_rule_version (id, office_id, rule_set_id, version, rules_json)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [
          ruleVersionId,
          input.officeId,
          input.ruleSetId,
          input.version,
          JSON.stringify(input.rulesJson),
        ],
      );
      insertingRuleVersion = false;
      for (const feeRule of input.channelFeeRules) {
        await client.query(
          `INSERT INTO channel_fee_rule
             (id, office_id, finance_rule_version_id, channel, component_type, payer,
              fee_mode, value_numeric, currency, source, raw_code, confidence, valid_from, valid_to)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            randomUUID(),
            input.officeId,
            ruleVersionId,
            feeRule.channel,
            feeRule.componentType,
            feeRule.payer,
            feeRule.feeMode,
            feeRule.value,
            feeRule.currency ?? null,
            feeRule.source,
            feeRule.rawCode ?? null,
            feeRule.confidence,
            feeRule.validFrom ?? null,
            feeRule.validTo ?? null,
          ],
        );
      }
      await client.query("COMMIT");
      return { status: "created" as const, ruleVersionId };
    } catch (error) {
      await client.query("ROLLBACK");
      if (!insertingRuleVersion || !isRuleVersionUniqueViolation(error))
        throw error;
      try {
        await client.query("BEGIN");
        const retryResult = await this.existingConfigurationResult(
          client,
          input,
        );
        if (!retryResult) throw error;
        await client.query("COMMIT");
        return retryResult;
      } catch (retryError) {
        await client.query("ROLLBACK");
        throw retryError;
      }
    } finally {
      client.release();
    }
  }
}
