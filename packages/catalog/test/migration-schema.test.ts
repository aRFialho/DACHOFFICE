import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    import.meta.dirname,
    "../../../db/migrations/005_tray_canonical_catalog.sql",
  ),
  "utf8",
);

describe("canonical catalog migration provenance", () => {
  it("requires sync-created facts to reference a mapped mapping for the same product", () => {
    expect(migration).toContain("UNIQUE (id, office_id, product_id, status)");
    expect(migration).toContain("source = 'manual'");
    expect(migration).toContain(
      "mapping_status text NOT NULL DEFAULT 'mapped' CHECK (mapping_status = 'mapped')",
    );
  });
  it("prevents an unresolved external X fact from using mapped external Y for the same product", () => {
    expect(migration).toContain(
      "external_variation_key text NOT NULL DEFAULT ''",
    );
    expect(migration).toContain(
      "UNIQUE (id, office_id, product_id, status, provider, external_product_id, external_variation_key)",
    );
    expect(migration).toMatch(
      /CREATE TABLE IF NOT EXISTS product_cost_snapshot[\s\S]*?FOREIGN KEY \(external_product_mapping_id, office_id, product_id, mapping_status, provider, external_product_id, external_variation_key\)[\s\S]*?REFERENCES external_product_mapping\(id, office_id, product_id, status, provider, external_product_id, external_variation_key\)/,
    );
    expect(migration).toMatch(
      /CREATE TABLE IF NOT EXISTS channel_listing[\s\S]*?FOREIGN KEY \(external_product_mapping_id, office_id, product_id, mapping_status, provider, external_product_id, external_variation_key\)[\s\S]*?REFERENCES external_product_mapping\(id, office_id, product_id, status, provider, external_product_id, external_variation_key\)/,
    );
  });
});
