import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(import.meta.dirname, "../../../db/migrations/006_finance_margin.sql"),
  "utf8",
);
const migrationDirectory = resolve(
  import.meta.dirname,
  "../../../db/migrations",
);
const forwardMigrationPath = resolve(
  migrationDirectory,
  "007_finance_rule_invariants.sql",
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

  it("uses a nonblank office-scoped idempotency key for component persistence", () => {
    expect(migration).toMatch(
      /CREATE TABLE IF NOT EXISTS order_financial_component[\s\S]*?idempotency_key text NOT NULL CHECK \(char_length\(btrim\(idempotency_key\)\) BETWEEN 1 AND 200\)[\s\S]*?UNIQUE \(office_id, idempotency_key\)/,
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

  it("rejects updates and deletes of immutable margin evidence", () => {
    expect(migration).toMatch(
      /CREATE FUNCTION reject_order_margin_snapshot_mutation\(\) RETURNS trigger LANGUAGE plpgsql AS \$\$[\s\S]*?RAISE EXCEPTION 'order_margin_snapshot is immutable';[\s\S]*?\$\$;/,
    );
    expect(migration).toContain(
      "BEFORE UPDATE OR DELETE ON order_margin_snapshot",
    );
  });

  it("rejects a referenced finance rule version from being updated or deleted", () => {
    expect(migration).toMatch(
      /CREATE FUNCTION reject_referenced_finance_rule_version_mutation\(\) RETURNS trigger LANGUAGE plpgsql AS \$\$[\s\S]*?IF EXISTS \([\s\S]*?FROM order_margin_snapshot[\s\S]*?finance_rule_version_id = OLD.id[\s\S]*?office_id = OLD.office_id[\s\S]*?\)[\s\S]*?RAISE EXCEPTION 'finance_rule_version is immutable after use';[\s\S]*?\$\$;/,
    );
    expect(migration).toContain(
      "BEFORE UPDATE OR DELETE ON finance_rule_version",
    );
  });

  it("indexes fee rules by their finance rule version", () => {
    expect(migration).toMatch(
      /CREATE INDEX IF NOT EXISTS channel_fee_rule_finance_rule_version_idx\r?\n\s+ON channel_fee_rule \(finance_rule_version_id, channel, valid_from, valid_to\);/,
    );
  });

  it("freezes fee rule inserts, updates, and deletes after their version is used", () => {
    expect(migration).toMatch(
      /CREATE FUNCTION reject_used_channel_fee_rule_mutation\(\) RETURNS trigger LANGUAGE plpgsql AS \$\$[\s\S]*?RAISE EXCEPTION 'channel_fee_rule is immutable after finance rule version use';[\s\S]*?RAISE EXCEPTION 'channel_fee_rule is immutable after finance rule version use';[\s\S]*?\$\$;/,
    );
    expect(migration).toContain(
      "BEFORE INSERT OR UPDATE OR DELETE ON channel_fee_rule",
    );
  });

  it("checks both associations before a fee rule can move between versions", () => {
    expect(migration).toMatch(
      /IF TG_OP <> 'INSERT' AND EXISTS \([\s\S]*?FROM order_margin_snapshot[\s\S]*?finance_rule_version_id = OLD.finance_rule_version_id[\s\S]*?office_id = OLD.office_id[\s\S]*?\) THEN[\s\S]*?RAISE EXCEPTION 'channel_fee_rule is immutable after finance rule version use';/,
    );
    expect(migration).toMatch(
      /IF TG_OP <> 'DELETE' AND EXISTS \([\s\S]*?FROM order_margin_snapshot[\s\S]*?finance_rule_version_id = NEW.finance_rule_version_id[\s\S]*?office_id = NEW.office_id[\s\S]*?\) THEN[\s\S]*?RAISE EXCEPTION 'channel_fee_rule is immutable after finance rule version use';/,
    );
  });

  it("adds migration 007 after migration 006", () => {
    expect(existsSync(forwardMigrationPath)).toBe(true);
    if (!existsSync(forwardMigrationPath)) return;

    const migrations = readdirSync(migrationDirectory).sort();
    expect(migrations.indexOf("006_finance_margin.sql")).toBeLessThan(
      migrations.indexOf("007_finance_rule_invariants.sql"),
    );
  });

  it("preflights incompatible configured fee-rule rows before adding invariants", () => {
    expect(existsSync(forwardMigrationPath)).toBe(true);
    if (!existsSync(forwardMigrationPath)) return;

    const forwardMigration = readFileSync(forwardMigrationPath, "utf8");
    expect(forwardMigration).toMatch(
      /DO \$\$[\s\S]*?FROM channel_fee_rule[\s\S]*?confidence <> 'ESTIMATED'[\s\S]*?RAISE EXCEPTION 'channel_fee_rule contains rows incompatible with finance rule invariants';[\s\S]*?\$\$;/,
    );
  });

  it("enforces configured fee-rule confidence as ESTIMATED", () => {
    expect(existsSync(forwardMigrationPath)).toBe(true);
    if (!existsSync(forwardMigrationPath)) return;

    const forwardMigration = readFileSync(forwardMigrationPath, "utf8");
    expect(forwardMigration).toContain("CHECK (confidence = 'ESTIMATED')");
  });

  it("enforces no percentage currency and a three-letter fixed currency", () => {
    expect(existsSync(forwardMigrationPath)).toBe(true);
    if (!existsSync(forwardMigrationPath)) return;

    const forwardMigration = readFileSync(forwardMigrationPath, "utf8");
    expect(forwardMigration).toContain(
      "(fee_mode = 'percentage' AND currency IS NULL)",
    );
    expect(forwardMigration).toContain(
      "(fee_mode = 'fixed' AND currency ~ '^[A-Z]{3}$')",
    );
  });
});
