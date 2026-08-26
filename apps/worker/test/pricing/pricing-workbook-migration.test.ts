import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  import.meta.dirname,
  "../../../../db/migrations/010_pricing_workbook_bytes.sql",
);

describe("pricing workbook bytes migration", () => {
  it("stores a bounded immutable XLSX payload in PostgreSQL", () => {
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;
    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain(
      "ADD COLUMN content_bytes bytea NOT NULL CHECK (octet_length(content_bytes) <= 10485760)",
    );
    expect(migration).toContain("pricing_workbook_artifact_immutable");
    expect(migration).toContain(
      "BEFORE UPDATE OR DELETE ON pricing_workbook_artifact",
    );
  });
});
