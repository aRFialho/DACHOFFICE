import { describe, expect, it } from "vitest";
import {
  createMarginTools,
  marginToolDefinitions,
  type MarginReportReadRepository,
} from "../src/modules/margin/margin-tools.js";
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
      toolCode: "margin.getReport",
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

class RecordingRepository implements MarginReportReadRepository {
  reads: Array<[string, string]> = [];
  async getLatestReport(office: string, task: string) {
    this.reads.push([office, task]);
    return { status: "not_found" as const };
  }
}

describe("margin.getReport", () => {
  it("is a READ tool, rejects arbitrary office input, and reads only after task policy authorization", async () => {
    const repository = new RecordingRepository();
    const registry = new ToolRegistry(marginToolDefinitions);
    const tools = createMarginTools({
      repository,
      registry,
      authorizationService: new ToolAuthorizationService(registry),
      contextLoader: {
        load: async () => ({
          ...trustedContext,
          lifecycleStatus: "suspended" as const,
        }),
      },
    });
    expect(marginToolDefinitions).toEqual([
      expect.objectContaining({
        code: "margin.getReport",
        actionClass: "READ",
        requiredGrant: "read",
      }),
    ]);
    await expect(
      tools.invoke({
        taskId,
        toolCode: "margin.getReport",
        input: { taskId, officeId: "other-office" },
      }),
    ).resolves.toEqual({
      status: "denied",
      reason: "tool_input_invalid",
    });
    await expect(
      tools.invoke({ taskId, toolCode: "margin.getReport", input: { taskId } }),
    ).resolves.toEqual({
      status: "denied",
      reason: "agent_suspended",
    });
    expect(repository.reads).toEqual([]);
  });

  it.each([
    { grants: [], expected: "tool_grant_missing" },
    {
      activeAgentVersionId: "version-current",
      expected: "agent_version_mismatch",
    },
    { hasTaskAuthority: false, expected: "task_authority_missing" },
  ])("denies $expected before report reads", async (override) => {
    const repository = new RecordingRepository();
    const registry = new ToolRegistry(marginToolDefinitions);
    const tools = createMarginTools({
      repository,
      registry,
      authorizationService: new ToolAuthorizationService(registry),
      contextLoader: { load: async () => ({ ...trustedContext, ...override }) },
    });
    await expect(
      tools.invoke({ taskId, toolCode: "margin.getReport", input: { taskId } }),
    ).resolves.toEqual({
      status: "denied",
      reason: override.expected,
    });
    expect(repository.reads).toEqual([]);
  });

  it("binds the repository read to the task policy office", async () => {
    const repository = new RecordingRepository();
    const registry = new ToolRegistry(marginToolDefinitions);
    const tools = createMarginTools({
      repository,
      registry,
      authorizationService: new ToolAuthorizationService(registry),
      contextLoader: { load: async () => trustedContext },
    });
    await expect(
      tools.invoke({ taskId, toolCode: "margin.getReport", input: { taskId } }),
    ).resolves.toEqual({ status: "not_found" });
    expect(repository.reads).toEqual([[officeId, taskId]]);
  });
});
