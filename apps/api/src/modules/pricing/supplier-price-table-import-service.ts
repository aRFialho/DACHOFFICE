import { createHash } from "node:crypto";
import { assertMoney, type Money } from "@dachbyte-office/finance";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sku = /^[A-Z0-9][A-Z0-9._-]*$/;
const currency = /^[A-Z]{3}$/;
const utc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

export type SupplierPriceTableImportInput = {
  officeId: string;
  supplierId: string;
  importedByUserId: string;
  sourceName: string;
  effectiveAt: string;
  observedAt: string;
  rows: readonly {
    sourceRowNumber: number;
    sku: string;
    cost: string;
    currency: string;
    sourceFields: Record<string, unknown>;
  }[];
};
export type ValidatedSupplierPriceTableImport = Omit<
  SupplierPriceTableImportInput,
  "rows"
> & {
  contentSha256: string;
  rows: readonly {
    sourceRowNumber: number;
    sku: string;
    cost: Money;
    currency: string;
    sourceFields: Record<string, unknown>;
  }[];
};
export interface SupplierPriceTableImportRepository {
  importTable(input: ValidatedSupplierPriceTableImport): Promise<{
    status: "created" | "unchanged";
    tableId: string;
    mappedRows: number;
    unresolvedRows: number;
  }>;
}

export class SupplierPriceTableImportService {
  constructor(
    private readonly repository: SupplierPriceTableImportRepository,
  ) {}
  async importTable(input: SupplierPriceTableImportInput) {
    return this.repository.importTable(validate(input));
  }
}

function validate(
  input: SupplierPriceTableImportInput,
): ValidatedSupplierPriceTableImport {
  if (
    !uuid.test(input.officeId) ||
    !uuid.test(input.supplierId) ||
    !uuid.test(input.importedByUserId) ||
    !nonBlank(input.sourceName, 160) ||
    !validUtc(input.effectiveAt) ||
    !validUtc(input.observedAt) ||
    Date.parse(input.observedAt) < Date.parse(input.effectiveAt) ||
    !Array.isArray(input.rows) ||
    input.rows.length === 0
  )
    throw invalid();
  const rows = input.rows.map((row) => {
    if (
      !Number.isInteger(row.sourceRowNumber) ||
      row.sourceRowNumber < 1 ||
      !sku.test(row.sku) ||
      !currency.test(row.currency) ||
      !record(row.sourceFields)
    )
      throw invalid();
    const cost = assertMoney(row.cost, "cost");
    if (scaled(cost) < 0n) throw invalid();
    return {
      sourceRowNumber: row.sourceRowNumber,
      sku: row.sku,
      cost,
      currency: row.currency,
      sourceFields: row.sourceFields,
    };
  });
  if (new Set(rows.map((row) => row.sourceRowNumber)).size !== rows.length)
    throw invalid();
  const evidence = {
    supplierId: input.supplierId,
    sourceName: input.sourceName,
    effectiveAt: input.effectiveAt,
    observedAt: input.observedAt,
    rows,
  };
  return {
    ...input,
    rows,
    contentSha256: createHash("sha256")
      .update(stableJson(evidence))
      .digest("hex"),
  };
}

const validUtc = (value: string): boolean =>
  utc.test(value) && !Number.isNaN(new Date(value).valueOf());
const nonBlank = (value: string, max: number): boolean =>
  typeof value === "string" && value.trim() !== "" && value.length <= max;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const invalid = (): Error => new Error("supplier_price_table_input_invalid");
const scaled = (value: Money): bigint =>
  BigInt(
    `${value.replace("-", "").split(".")[0]}${(value.split(".")[1] ?? "").padEnd(4, "0")}`,
  ) * (value.startsWith("-") ? -1n : 1n);
const stableJson = (value: unknown): string =>
  Array.isArray(value)
    ? `[${value.map(stableJson).join(",")}]`
    : record(value)
      ? `{${Object.keys(value)
          .sort()
          .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
          .join(",")}}`
      : JSON.stringify(value);
