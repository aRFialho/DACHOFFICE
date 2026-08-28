import { describe, expect, it } from "vitest";
import { PostgresFinanceRepository } from "../src/modules/finance/postgres-finance-repository.js";

const officeId = "11111111-1111-4111-8111-111111111111";
const ruleSetId = "22222222-2222-4222-8222-222222222222";
const ruleVersionId = "33333333-3333-4333-8333-333333333333";

class ExistingVersionPool {
  readonly queries: Array<{
    text: string;
    values: readonly unknown[] | undefined;
  }> = [];
  constructor(private readonly source: string) {}

  async connect() {
    return {
      query: async (text: string, values?: readonly unknown[]) => {
        this.queries.push({ text, values });
        if (text.includes("FROM finance_rule_version")) {
          return {
            rows: [{ id: ruleVersionId, rules_json: { rawCodeMappings: {} } }],
          };
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

describe("finance rule version idempotency", () => {
  it("returns unchanged for the same canonical version/config without mutating fee rules", async () => {
    const pool = new ExistingVersionPool("office_config");
    const repository = new PostgresFinanceRepository(pool);

    await expect(repository.createRuleVersion(input)).resolves.toEqual({
      status: "unchanged",
    });
    expect(
      pool.queries.some((query) => query.text.includes("INSERT INTO")),
    ).toBe(false);
    expect(
      pool.queries.find((query) =>
        query.text.includes("FROM finance_rule_version"),
      )?.values,
    ).toEqual([officeId, ruleSetId, 2]);
  });

  it("returns a fixed conflict for a different same-version config without mutating fee rules", async () => {
    const pool = new ExistingVersionPool("different_config");
    const repository = new PostgresFinanceRepository(pool);

    await expect(repository.createRuleVersion(input)).resolves.toEqual({
      status: "conflict",
    });
    expect(
      pool.queries.some((query) => query.text.includes("INSERT INTO")),
    ).toBe(false);
  });
});
