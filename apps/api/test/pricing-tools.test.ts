import { describe, expect, it } from "vitest";
import {
  createPricingTools,
  pricingToolDefinitions,
  type PricingReportReadRepository,
} from "../src/modules/pricing/pricing-tools.js";
import { ToolAuthorizationService } from "../src/modules/policy/tool-authorization-service.js";
import { ToolRegistry } from "../src/modules/tools/tool-registry.js";

const officeId = "11111111-1111-4111-8111-111111111111";
const taskId = "22222222-2222-4222-8222-222222222222";

const trustedContext = {
  officeId,
  hasTaskAuthority: true,
  lifecycleStatus: "active" as const,
  grants: [
    {
      toolCode: "pricing.getReport",
      accessLevel: "read" as const,
      revokedAt: null,
    },
    {
      toolCode: "pricing.prepareAction",
      accessLevel: "write" as const,
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

class RecordingRepository implements PricingReportReadRepository {
  reads: Array<[string, string]> = [];
  async getReportForOfficeTask(office: string, task: string) {
    this.reads.push([office, task]);
    return { status: "not_found" as const };
  }
}

describe("pricing tools", () => {
  it("registers report reads and proposal preparation with their correct policy classes", () => {
    expect(pricingToolDefinitions).toEqual([
      expect.objectContaining({
        code: "pricing.getReport",
        actionClass: "READ",
        requiredGrant: "read",
      }),
      expect.objectContaining({
        code: "pricing.prepareAction",
        actionClass: "PREPARE",
        requiredGrant: "write",
      }),
    ]);
  });

  it("rejects arbitrary office input and binds report reads to the task policy office", async () => {
    const repository = new RecordingRepository();
    const registry = new ToolRegistry(pricingToolDefinitions);
    const tools = createPricingTools({
      repository,
      registry,
      authorizationService: new ToolAuthorizationService(registry),
      contextLoader: { load: async () => trustedContext },
    });
    await expect(
      tools.invoke({
        taskId,
        toolCode: "pricing.getReport",
        input: { taskId, officeId: "attacker-office" },
      }),
    ).resolves.toEqual({ status: "denied", reason: "tool_input_invalid" });
    await expect(
      tools.invoke({
        taskId,
        toolCode: "pricing.getReport",
        input: { taskId },
      }),
    ).resolves.toEqual({ status: "not_found" });
    expect(repository.reads).toEqual([[officeId, taskId]]);
  });

  it("evaluates a pricing proposal without calling an external provider", async () => {
    const repository = new RecordingRepository();
    const registry = new ToolRegistry(pricingToolDefinitions);
    const tools = createPricingTools({
      repository,
      registry,
      authorizationService: new ToolAuthorizationService(registry),
      contextLoader: {
        load: async () => ({
          ...trustedContext,
          officeTrustLevel: "analytical" as const,
        }),
      },
    });
    await expect(
      tools.invoke({
        taskId,
        toolCode: "pricing.prepareAction",
        input: { taskId },
      }),
    ).resolves.toEqual({
      status: "approval_required",
      reason: "trust_requires_approval",
    });
    expect(repository.reads).toEqual([]);
  });
});
