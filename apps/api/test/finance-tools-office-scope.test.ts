import { describe, expect, it } from "vitest";
import {
  createFinanceTools,
  financeToolDefinitions,
  type FinanceReadRepository,
} from "../src/modules/finance/finance-tools.js";
import { ToolAuthorizationService } from "../src/modules/policy/tool-authorization-service.js";
import { ToolRegistry } from "../src/modules/tools/tool-registry.js";

const officeA = "11111111-1111-4111-8111-111111111111";
const officeB = "22222222-2222-4222-8222-222222222222";

class RecordingRepository implements FinanceReadRepository {
  officeIds: string[] = [];
  marginOfficeIds: string[] = [];

  async getLatestRuleVersion(officeId: string) {
    this.officeIds.push(officeId);
    return { status: "not_found" as const };
  }

  async getLatestMarginSnapshot(officeId: string) {
    this.marginOfficeIds.push(officeId);
    return { status: "not_found" as const };
  }
}

describe("finance tool office authority", () => {
  it("rejects caller Office B for both tools and reads valid input with task Office A", async () => {
    const repository = new RecordingRepository();
    const registry = new ToolRegistry(financeToolDefinitions);
    const tools = createFinanceTools({
      repository,
      registry,
      authorizationService: new ToolAuthorizationService(registry),
      contextLoader: {
        load: async () => ({
          officeId: officeA,
          hasTaskAuthority: true,
          lifecycleStatus: "active",
          grants: [
            {
              toolCode: "finance.getRules",
              accessLevel: "read",
              revokedAt: null,
            },
          ],
          activeAgentVersionId: "version-1",
          requestedAgentVersionId: "version-1",
          officeTrustLevel: "autonomous",
          agentTrustCeiling: "autonomous",
          policyConditionsSatisfied: true,
          actionLimitsSatisfied: true,
        }),
      },
    });

    await expect(
      tools.invoke({
        taskId: "task-1",
        toolCode: "finance.getRules",
        input: { officeId: officeB },
      }),
    ).resolves.toEqual({ status: "denied", reason: "tool_input_invalid" });
    await expect(
      tools.invoke({
        taskId: "task-1",
        toolCode: "finance.getMargin",
        input: {
          orderHeaderId: "33333333-3333-4333-8333-333333333333",
          officeId: officeB,
        },
      }),
    ).resolves.toEqual({ status: "denied", reason: "tool_input_invalid" });
    expect(repository.officeIds).toEqual([]);
    expect(repository.marginOfficeIds).toEqual([]);

    await expect(
      tools.invoke({
        taskId: "task-1",
        toolCode: "finance.getRules",
        input: {},
      }),
    ).resolves.toEqual({ status: "not_found" });
    expect(repository.officeIds).toEqual([officeA]);
  });
});
