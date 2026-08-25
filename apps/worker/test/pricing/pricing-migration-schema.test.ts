import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  import.meta.dirname,
  "../../../../db/migrations/009_cost_pricing_agent.sql",
);

describe("cost pricing migration", () => {
  it("persists approved Sprint 9 boundaries", () => {
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;
    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toMatch(
      /CREATE TABLE IF NOT EXISTS supplier_price_table[\s\S]*?office_id uuid NOT NULL[\s\S]*?supplier_id uuid NOT NULL[\s\S]*?source_name text NOT NULL[\s\S]*?effective_at timestamptz NOT NULL[\s\S]*?content_sha256 text NOT NULL[\s\S]*?idempotency_key text NOT NULL[\s\S]*?UNIQUE \(office_id, idempotency_key\)/,
    );
    expect(migration).toMatch(
      /CREATE TABLE IF NOT EXISTS supplier_price_table_row[\s\S]*?supplier_price_table_id uuid NOT NULL[\s\S]*?source_sku text NOT NULL[\s\S]*?cost_numeric numeric\(19,4\) NOT NULL[\s\S]*?currency text NOT NULL[\s\S]*?source_fields_json jsonb NOT NULL/,
    );
    expect(migration).toContain(
      "mapping_status text NOT NULL CHECK (mapping_status IN ('mapped', 'unresolved'))",
    );
    expect(migration).toContain(
      "supplier_price_table_row_exact_product_mapping",
    );
    expect(migration).toMatch(
      /CREATE TABLE IF NOT EXISTS pricing_simulation_report[\s\S]*?office_id uuid NOT NULL[\s\S]*?task_id uuid NOT NULL[\s\S]*?agent_id uuid NOT NULL[\s\S]*?agent_version_id uuid NOT NULL[\s\S]*?channel text NOT NULL[\s\S]*?period_start timestamptz NOT NULL[\s\S]*?period_end timestamptz NOT NULL[\s\S]*?report_json jsonb NOT NULL[\s\S]*?provenance_json jsonb NOT NULL[\s\S]*?status text NOT NULL CHECK \(status IN \('completed', 'completed_with_findings'\)\)[\s\S]*?confidence text NOT NULL CHECK \(confidence IN \('REAL', 'ESTIMATED'\)\)[\s\S]*?UNIQUE \(office_id, task_id\)/,
    );
    expect(migration).toContain(
      "BEFORE UPDATE OR DELETE ON pricing_simulation_report",
    );
    expect(migration).toMatch(
      /CREATE TABLE IF NOT EXISTS pricing_workbook_artifact[\s\S]*?pricing_simulation_report_id uuid NOT NULL[\s\S]*?storage_key text NOT NULL[\s\S]*?content_sha256 text NOT NULL[\s\S]*?byte_length integer NOT NULL CHECK \(byte_length > 0\)[\s\S]*?UNIQUE \(office_id, pricing_simulation_report_id\)/,
    );
    expect(migration).toMatch(
      /CREATE TABLE IF NOT EXISTS pricing_prepared_action[\s\S]*?pricing_simulation_report_id uuid NOT NULL[\s\S]*?product_id uuid NOT NULL[\s\S]*?proposed_price_numeric numeric\(19,4\) NOT NULL[\s\S]*?break_even_minimum_price_numeric numeric\(19,4\) NOT NULL[\s\S]*?policy_decision text NOT NULL CHECK \(policy_decision IN \('allowed', 'approval_required', 'denied'\)\)[\s\S]*?status text NOT NULL CHECK \(status IN \('prepared', 'blocked'\)\)/,
    );
    expect(migration).toContain(
      "BEFORE UPDATE OR DELETE ON pricing_prepared_action",
    );
    expect(migration).toContain("numeric(19,4)");
    expect(migration).not.toMatch(
      /\b(?:real|double precision|float)(?=\s+(?:NOT|NULL|DEFAULT|CHECK|REFERENCES|PRIMARY|UNIQUE)|\s*[,)])/i,
    );
  });
});
