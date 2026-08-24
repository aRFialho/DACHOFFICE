import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(import.meta.dirname, "../../../db/migrations/006_finance_margin.sql"),
  "utf8",
);

describe("finance margin migration", () => {
  it("uses numeric(19,4) for financial amounts without floating point types", () => {
    expect(migration).toContain("numeric(19,4)");
    expect(migration).not.toMatch(
      /\b(?:real|double precision|float)(?=\s+(?:NOT|NULL|DEFAULT|CHECK|REFERENCES|PRIMARY|UNIQUE)|\s*[,)])/i,
    );
  });

  it("versions office-scoped rule sets and connects fee rules to a version", () => {
    expect(migration).toMatch(
      /CREATE TABLE IF NOT EXISTS finance_rule_set[\s\S]*?office_id uuid NOT NULL REFERENCES office\(id\)[\s\S]*?UNIQUE \(office_id, code\)/,
    );
    expect(migration).toMatch(
      /CREATE TABLE IF NOT EXISTS finance_rule_version[\s\S]*?rule_set_id uuid NOT NULL[\s\S]*?version integer NOT NULL CHECK \(version > 0\)[\s\S]*?UNIQUE \(rule_set_id, version\)/,
    );
    expect(migration).toMatch(
      /CREATE TABLE IF NOT EXISTS channel_fee_rule[\s\S]*?finance_rule_version_id uuid NOT NULL[\s\S]*?FOREIGN KEY \(finance_rule_version_id, office_id\)[\s\S]*?REFERENCES finance_rule_version\(id, office_id\)/,
    );
  });

  it("preserves normalized component provenance and constrains its taxonomy", () => {
    expect(migration).toMatch(
      /CREATE TABLE IF NOT EXISTS order_financial_component[\s\S]*?component_type text NOT NULL CHECK \(component_type IN \([\s\S]*?'marketplace_commission'[\s\S]*?'other'[\s\S]*?\)\)[\s\S]*?payer text NOT NULL CHECK \(payer IN \('seller', 'marketplace', 'buyer', 'unknown'\)\)[\s\S]*?source text NOT NULL[\s\S]*?raw_code text[\s\S]*?confidence text NOT NULL CHECK \(confidence IN \('REAL', 'ESTIMATED'\)\)/,
    );
  });

  it("stores append-only margin evidence with revenue basis and rule provenance", () => {
    expect(migration).toMatch(
      /CREATE TABLE IF NOT EXISTS order_margin_snapshot[\s\S]*?order_header_id uuid NOT NULL[\s\S]*?finance_rule_version_id uuid NOT NULL[\s\S]*?revenue_basis text NOT NULL[\s\S]*?contribution_amount_numeric numeric\(19,4\) NOT NULL[\s\S]*?contribution_percent_numeric numeric\(19,4\) NOT NULL[\s\S]*?evidence_json jsonb NOT NULL/,
    );
    expect(migration).not.toMatch(
      /CREATE TABLE IF NOT EXISTS order_margin_snapshot[\s\S]*?updated_at/,
    );
  });
});
