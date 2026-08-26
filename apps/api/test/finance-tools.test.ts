import { describe, expect, it } from "vitest";
import {
  createFinanceTools,
  financeToolDefinitions,
  type FinanceReadRepository,
} from "../src/modules/finance/finance-tools.js";
import { ToolAuthorizationService } from "../src/modules/policy/tool-authorization-service.js";
import { ToolRegistry } from "../src/modules/tools/tool-registry.js";

const trustedContext = {
  officeId: "11111111-1111-4111-8111-111111111111",
  hasTaskAuthority: true,
  lifecycleStatus: "active" as const,
  grants: [
    {
      toolCode: "finance.getRules",
      accessLevel: "read" as const,
      revokedAt: null,
    },
  ],
  activeAgentVersionId: "version-1",
  requestedAgentVersionId: "version-1",
  officeTrustLevel: "autonomous" as const,
  agentTrustCeiling: "autonomous" as const,
  policyConditionsSatisfied: true,
  actionLimitsSatisfied: true,
};

class ReadRepository implements FinanceReadRepository {
  reads = 0;
  async getLatestRuleVersion() {
    this.reads += 1;
    return { status: "not_found" as const };
  }
  async getLatestMarginSnapshot() {
    this.reads += 1;
    return { status: "not_found" as const };
  }
}

const createTools = (
  repository: FinanceReadRepository,
  context = trustedContext,
) => {
  const registry = new ToolRegistry(financeToolDefinitions);
  return createFinanceTools({
    repository,
    registry,
    authorizationService: new ToolAuthorizationService(registry),
    contextLoader: { load: async () => context },
  });
};

describe("finance read tools", () => {
  it("authorizes task authority before a validated finance-rule read and has no provider path", async () => {
    const repository = new ReadRepository();
    const tools = createTools(repository, { ...trustedContext, grants: [] });

    await expect(
      tools.invoke({
        taskId: "task-1",
        toolCode: "finance.getRules",
        input: {},
      }),
    ).resolves.toEqual({ status: "denied", reason: "tool_grant_missing" });
    expect(repository.reads).toBe(0);
    expect(financeToolDefinitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "finance.getRules",
          actionClass: "READ",
          requiredGrant: "read",
        }),
        expect.objectContaining({
          code: "finance.getMargin",
          actionClass: "READ",
          requiredGrant: "read",
        }),
      ]),
    );
  });
});
