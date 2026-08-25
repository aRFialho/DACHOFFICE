import { beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/app.js";
import {
  MarginAnalysisService,
  type MarginAnalysisRepository,
} from "../src/modules/margin/margin-analysis-service.js";
import {
  createAuthService,
  hashPassword,
  InMemoryAuthRepository,
} from "../src/modules/auth/index.js";

const tokenConfig = {
  audience: "dachbyte-office-web",
  issuer: "dachbyte-office-api",
  accessTokenSecret: "test-secret-with-at-least-thirty-two-bytes!",
  accessTokenTtlSeconds: 600,
  refreshTokenTtlSeconds: 604800,
  secureCookies: false,
};
const password = "Correct-Horse-Battery-Staple-2026";
const officeId = "11111111-1111-4111-8111-111111111111";
const agentId = "22222222-2222-4222-8222-222222222222";

class RecordingRepository implements MarginAnalysisRepository {
  eligibilityCalls = 0;
  queueCalls: unknown[] = [];
  reportTaskIds: string[] = [];
  eligible = true;

  async getAgentEligibility() {
    this.eligibilityCalls += 1;
    return this.eligible
      ? {
          officeId,
          agentId,
          lifecycleStatus: "active" as const,
          activeAgentVersionId: "33333333-3333-4333-8333-333333333333",
          grants: [
            {
              toolCode: "finance.getRules",
              accessLevel: "read" as const,
              revokedAt: null,
            },
            {
              toolCode: "finance.getMargin",
              accessLevel: "read" as const,
              revokedAt: null,
            },
            {
              toolCode: "products.getCost",
              accessLevel: "read" as const,
              revokedAt: null,
            },
          ],
        }
      : null;
  }

  async queueMarginAnalysis(
    input: Parameters<MarginAnalysisRepository["queueMarginAnalysis"]>[0],
  ) {
    this.queueCalls.push(input);
    return {
      status: "queued" as const,
      task: {
        id: "44444444-4444-4444-8444-444444444444",
        officeId: input.officeId,
        agentId: input.agentId,
        agentVersionId: input.agentVersionId,
        status: "queued" as const,
        context: input.context,
      },
    };
  }

  async getReportForTask(taskId: string) {
    this.reportTaskIds.push(taskId);
    return taskId === "44444444-4444-4444-8444-444444444444"
      ? { status: "found" as const, report: { status: "completed" } }
      : { status: "not_found" as const };
  }
}

describe("margin analysis routes", () => {
  let authRepository: InMemoryAuthRepository;

  beforeEach(async () => {
    authRepository = new InMemoryAuthRepository();
    await authRepository.seedUser({
      id: "55555555-5555-4555-8555-555555555555",
      name: "Admin Master",
      email: "admin@example.com",
      role: "admin_master",
      active: true,
      passwordHash: await hashPassword(password),
      sessionVersion: 1,
    });
  });

  it("queues a validated human margin task with the server-selected immutable agent version", async () => {
    const repository = new RecordingRepository();
    const server = buildServer({
      authService: createAuthService({
        repository: authRepository,
        tokenConfig,
      }),
      authTokenConfig: tokenConfig,
      marginAnalysisService: new MarginAnalysisService(repository),
    });
    const login = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "admin@example.com", password },
    });
    const response = await server.inject({
      method: "POST",
      url: "/v1/margin/analyses",
      headers: { authorization: `Bearer ${login.json().accessToken}` },
      payload: {
        officeId,
        agentId,
        periodStart: "2026-08-01T00:00:00.000Z",
        periodEnd: "2026-08-31T23:59:59.999Z",
        channels: ["shopee"],
        skus: ["SKU-1"],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().task).toMatchObject({
      status: "queued",
      officeId,
      agentId,
      agentVersionId: "33333333-3333-4333-8333-333333333333",
    });
    expect(repository.queueCalls).toEqual([
      expect.objectContaining({
        agentVersionId: "33333333-3333-4333-8333-333333333333",
        context: [
          { key: "periodStart", value: "2026-08-01T00:00:00.000Z" },
          { key: "periodEnd", value: "2026-08-31T23:59:59.999Z" },
          {
            key: "agentVersionId",
            value: "33333333-3333-4333-8333-333333333333",
          },
          { key: "channels", value: '["shopee"]' },
          { key: "skus", value: '["SKU-1"]' },
        ],
      }),
    ]);
    await server.close();
  });

  it("rejects invalid input or ineligible agents before a task/outbox write", async () => {
    const repository = new RecordingRepository();
    const server = buildServer({
      authService: createAuthService({
        repository: authRepository,
        tokenConfig,
      }),
      authTokenConfig: tokenConfig,
      marginAnalysisService: new MarginAnalysisService(repository),
    });
    const login = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "admin@example.com", password },
    });
    const invalid = await server.inject({
      method: "POST",
      url: "/v1/margin/analyses",
      headers: { authorization: `Bearer ${login.json().accessToken}` },
      payload: {
        officeId,
        agentId,
        periodStart: "bad",
        periodEnd: "2026-08-01T00:00:00.000Z",
      },
    });
    expect(invalid.statusCode).toBe(400);
    expect(repository.eligibilityCalls).toBe(0);
    expect(repository.queueCalls).toEqual([]);

    repository.eligible = false;
    const denied = await server.inject({
      method: "POST",
      url: "/v1/margin/analyses",
      headers: { authorization: `Bearer ${login.json().accessToken}` },
      payload: {
        officeId,
        agentId,
        periodStart: "2026-08-01T00:00:00.000Z",
        periodEnd: "2026-08-31T23:59:59.999Z",
      },
    });
    expect(denied.statusCode).toBe(400);
    expect(repository.queueCalls).toEqual([]);
    await server.close();
  });

  it("reads a report by task ID only and never accepts an office selector", async () => {
    const repository = new RecordingRepository();
    const server = buildServer({
      authService: createAuthService({
        repository: authRepository,
        tokenConfig,
      }),
      authTokenConfig: tokenConfig,
      marginAnalysisService: new MarginAnalysisService(repository),
    });
    const login = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "admin@example.com", password },
    });
    const response = await server.inject({
      method: "GET",
      url: "/v1/margin/analyses/44444444-4444-4444-8444-444444444444?officeId=other-office",
      headers: { authorization: `Bearer ${login.json().accessToken}` },
    });
    expect(response.statusCode).toBe(200);
    expect(repository.reportTaskIds).toEqual([
      "44444444-4444-4444-8444-444444444444",
    ]);
    await server.close();
  });
});
