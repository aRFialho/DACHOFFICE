import { beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/app.js";
import {
  createAgentService,
  type AgentRepository,
} from "../src/modules/admin/agent-service.js";
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
const payload = {
  officeId: "office-1",
  departmentId: "department-1",
  name: "Finance Analyst",
  title: "Financial Analyst",
  primaryRole: "finance",
  basePrompt: "Use approved financial sources only.",
  mission: "Monitor financial health.",
  communicationStyle: "concise",
  responsibilities: ["monitor"],
  restrictions: ["no external writes"],
  modelProfile: "gpt-5",
  trustCeiling: "analytical",
  schedules: [
    {
      weekday: 1,
      workStart: "08:00",
      workEnd: "17:00",
      timezone: "America/Sao_Paulo",
      onCall: false,
    },
  ],
  grants: [{ toolCode: "ledger.read", accessLevel: "read" }],
};

const repository: AgentRepository = {
  createAgent: async (input) => ({
    id: "agent-1",
    lifecycleStatus: "draft",
    versionNumber: 1,
    ...input,
  }),
};

describe("Agent Forge endpoint", () => {
  let authRepository: InMemoryAuthRepository;

  beforeEach(async () => {
    authRepository = new InMemoryAuthRepository();
    await authRepository.seedUser({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Admin Master",
      email: "admin@example.com",
      role: "admin_master",
      active: true,
      passwordHash: await hashPassword(password),
      sessionVersion: 1,
    });
  });

  it("requires an authenticated Admin Master", async () => {
    const server = buildServer({
      authService: createAuthService({
        repository: authRepository,
        tokenConfig,
      }),
      authTokenConfig: tokenConfig,
      agentService: createAgentService(repository),
    });
    const response = await server.inject({
      method: "POST",
      url: "/v1/admin/agents",
      payload,
    });
    expect(response.statusCode).toBe(401);
    await server.close();
  });

  it("creates a draft agent attributed to the authenticated Admin Master", async () => {
    const server = buildServer({
      authService: createAuthService({
        repository: authRepository,
        tokenConfig,
      }),
      authTokenConfig: tokenConfig,
      agentService: createAgentService(repository),
    });
    const login = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "admin@example.com", password },
    });
    const response = await server.inject({
      method: "POST",
      url: "/v1/admin/agents",
      headers: { authorization: `Bearer ${login.json().accessToken}` },
      payload,
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().agent).toMatchObject({
      id: "agent-1",
      lifecycleStatus: "draft",
      versionNumber: 1,
      createdByUserId: "11111111-1111-4111-8111-111111111111",
    });
    await server.close();
  });
});
