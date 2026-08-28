import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  import.meta.dirname,
  "../../../../db/migrations/008_margin_analysis_reports.sql",
);

describe("margin analysis report migration", () => {
  it("creates an immutable office/task-scoped report with financial totals and provenance", () => {
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;
    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toMatch(
      /CREATE TABLE IF NOT EXISTS margin_analysis_report[\s\S]*?office_id uuid NOT NULL[\s\S]*?task_id uuid NOT NULL[\s\S]*?agent_id uuid NOT NULL[\s\S]*?agent_version_id uuid NOT NULL[\s\S]*?period_start timestamptz NOT NULL[\s\S]*?period_end timestamptz NOT NULL[\s\S]*?filters_json jsonb NOT NULL[\s\S]*?report_json jsonb NOT NULL[\s\S]*?evidence_json jsonb NOT NULL[\s\S]*?provenance_json jsonb NOT NULL[\s\S]*?status text NOT NULL CHECK \(status IN \('completed', 'no_margin_snapshots'\)\)[\s\S]*?confidence text NOT NULL CHECK \(confidence IN \('REAL', 'ESTIMATED'\)\)[\s\S]*?revenue_numeric numeric\(19,4\) NOT NULL[\s\S]*?contribution_percent_numeric numeric\(19,4\) NOT NULL[\s\S]*?UNIQUE \(office_id, task_id\)[\s\S]*?UNIQUE \(office_id, idempotency_key\)/,
    );
    expect(migration).toContain("FOREIGN KEY (task_id, office_id)");
    expect(migration).toContain("FOREIGN KEY (agent_id, office_id)");
    expect(migration).toContain("FOREIGN KEY (agent_version_id, agent_id)");
    expect(migration).toContain(
      "BEFORE UPDATE OR DELETE ON margin_analysis_report",
    );
  });

  it("adds office/task and latest-report indexes without storing provider payload columns", () => {
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;
    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain("margin_analysis_report_office_task_idx");
    expect(migration).toContain("margin_analysis_report_office_calculated_idx");
    expect(migration).not.toMatch(/raw_(?:payload|snapshot)_json|credential/i);
  });
});
