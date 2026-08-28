import { describe, expect, it } from "vitest";
import { PostgresFinanceRepository } from "../src/modules/finance/postgres-finance-repository.js";

const officeId = "11111111-1111-4111-8111-111111111111";
const ruleSetId = "22222222-2222-4222-8222-222222222222";
const ruleVersionId = "33333333-3333-4333-8333-333333333333";

class ConcurrentVersionPool {
  readonly queries: Array<{
    text: string;
    values: readonly unknown[] | undefined;
  }> = [];
  private versionReads = 0;
  constructor(private readonly source: string) {}

  async connect() {
    return {
      query: async (text: string, values?: readonly unknown[]) => {
        this.queries.push({ text, values });
        if (text.includes("FROM finance_rule_version")) {
          this.versionReads += 1;
          return this.versionReads === 1
            ? { rows: [] }
            : {
                rows: [
                  { id: ruleVersionId, rules_json: { rawCodeMappings: {} } },
                ],
              };
        }
        if (text.includes("INSERT INTO finance_rule_version")) {
          throw Object.assign(new Error("duplicate key"), {
            code: "23505",
            constraint: "finance_rule_version_rule_set_id_version_key",
          });
        }
        if (text.includes("FROM channel_fee_rule")) {
          return {
            rows: [
              {
                channel: "tray",
                component_type: "marketplace_commission",
                payer: "seller",
                fee_mode: "percentage",
                value_numeric: "16.5000",
                currency: null,
                source: this.source,
                raw_code: null,
                confidence: "ESTIMATED",
                valid_from: null,
                valid_to: null,
              },
            ],
          };
        }
        return { rows: [] };
      },
      release: () => undefined,
    };
  }
}

const input = {
  officeId,
  ruleSetId,
  version: 2,
  rulesJson: { rawCodeMappings: {} },
  channelFeeRules: [
    {
      channel: "tray",
      componentType: "marketplace_commission",
      payer: "seller",
      feeMode: "percentage",
      value: "16.5000",
      source: "office_config",
      confidence: "ESTIMATED" as const,
    },
  ],
};

describe("concurrent finance rule version retries", () => {
  it("re-reads a concurrent matching version and returns unchanged without fee writes", async () => {
    const pool = new ConcurrentVersionPool("office_config");

    await expect(
      new PostgresFinanceRepository(pool).createRuleVersion(input),
    ).resolves.toEqual({ status: "unchanged" });
    expect(pool.queries.filter((query) => query.text === "BEGIN")).toHaveLength(
      2,
    );
    expect(
      pool.queries.filter((query) => query.text === "ROLLBACK"),
    ).toHaveLength(1);
    expect(
      pool.queries.filter((query) =>
        query.text.includes("FROM finance_rule_version"),
      ),
    ).toHaveLength(2);
    expect(
      pool.queries.some((query) =>
        query.text.includes("INSERT INTO channel_fee_rule"),
      ),
    ).toBe(false);
  });

  it("re-reads a concurrent different version and returns conflict without fee writes", async () => {
    const pool = new ConcurrentVersionPool("different_config");

    await expect(
      new PostgresFinanceRepository(pool).createRuleVersion(input),
    ).resolves.toEqual({ status: "conflict" });
    expect(
      pool.queries.filter((query) => query.text === "ROLLBACK"),
    ).toHaveLength(1);
    expect(
      pool.queries.some((query) =>
        query.text.includes("INSERT INTO channel_fee_rule"),
      ),
    ).toBe(false);
  });
});
