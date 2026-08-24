import { describe, expect, it } from "vitest";
import { PostgresFinanceRepository } from "../src/modules/finance/postgres-finance-repository.js";

const officeId = "11111111-1111-4111-8111-111111111111";
const ruleSetId = "22222222-2222-4222-8222-222222222222";
const ruleVersionId = "33333333-3333-4333-8333-333333333333";

type Query = { text: string; values: readonly unknown[] | undefined };

class RecordingPool {
  readonly queries: Query[] = [];
  released = false;

  async connect() {
    return {
      query: async (text: string, values?: readonly unknown[]) => {
        this.queries.push({ text, values });
        if (text.includes("FROM finance_rule_version")) {
          return {
            rows: [
              {
                id: ruleVersionId,
                rule_set_id: ruleSetId,
                version: 2,
                rules_json: { rawCodeMappings: {} },
                created_at: "2026-08-24T10:00:00.000Z",
              },
            ],
          };
        }
        return { rows: [] };
      },
      release: () => {
        this.released = true;
      },
    };
  }
}

describe("PostgresFinanceRepository", () => {
  it("reads the latest finance rule version with an office-scoped parameterized query", async () => {
    const pool = new RecordingPool();
    const repository = new PostgresFinanceRepository(pool);

    await expect(repository.getLatestRuleVersion(officeId)).resolves.toEqual({
      status: "found",
      ruleVersion: {
        id: ruleVersionId,
        ruleSetId,
        version: 2,
        rulesJson: { rawCodeMappings: {} },
        createdAt: "2026-08-24T10:00:00.000Z",
      },
    });
    expect(pool.queries).toHaveLength(1);
    expect(pool.queries[0]?.text).toContain("WHERE office_id = $1");
    expect(pool.queries[0]?.values).toEqual([officeId]);
    expect(pool.released).toBe(true);
  });
});
