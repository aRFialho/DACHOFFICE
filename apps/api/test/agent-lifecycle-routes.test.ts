import { beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/app.js";
import {
  createAgentLifecycleService,
  type AgentLifecycleRepository,
} from "../src/modules/admin/agent-lifecycle-service.js";
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
const versionPayload = {
  basePrompt: "Use only authorized data.",
  mission: "Review operations.",
  communicationStyle: "concise",
  responsibilities: ["review"],
  restrictions: ["no writes"],
  modelProfile: "gpt-5",
  trustCeiling: "analytical",
  changeType: "hard",
};

const calls: string[] = [];
const repository: AgentLifecycleRepository = {
  appendVersion: async (input) => ({
    id: "version-2",
    versionNumber: 2,
    ...input,
  }),
  transitionLifecycle: async () => true,
  replaceSchedule: async () => true,
  revokeGrant: async () => {
    calls.push("revoked");
    return true;
  },
};

describe("Agent lifecycle endpoints", () => {
  let authRepository: InMemoryAuthRepository;

  beforeEach(async () => {
    calls.length = 0;
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

  const server = () =>
    buildServer({
      authService: createAuthService({
        repository: authRepository,
        tokenConfig,
      }),
      authTokenConfig: tokenConfig,
      agentLifecycleService: createAgentLifecycleService(repository),
    });

  const login = async (app: ReturnType<typeof server>): Promise<string> => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "admin@example.com", password },
    });
    return response.json().accessToken;
  };

  it("requires an authenticated Admin Master to append an agent version", async () => {
    const app = server();
    const response = await app.inject({
      method: "POST",
      url: "/v1/admin/agents/agent-1/versions",
      payload: versionPayload,
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("creates a new version and revokes a matching grant without deleting it", async () => {
    const app = server();
    const accessToken = await login(app);
    const version = await app.inject({
      method: "POST",
      url: "/v1/admin/agents/agent-1/versions",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: versionPayload,
    });
    const revoke = await app.inject({
      method: "DELETE",
      url: "/v1/admin/agents/agent-1/tool-grants/grant-1",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(version.statusCode).toBe(201);
    expect(version.json().version).toMatchObject({
      id: "version-2",
      versionNumber: 2,
      agentId: "agent-1",
    });
    expect(revoke.statusCode).toBe(204);
    expect(calls).toEqual(["revoked"]);
    await app.close();
  });
});
