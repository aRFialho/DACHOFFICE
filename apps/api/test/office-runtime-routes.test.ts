import { beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/app.js";
import {
  createAuthService,
  hashPassword,
  InMemoryAuthRepository,
} from "../src/modules/auth/index.js";
import type { OfficeRuntimeService } from "../src/modules/office-runtime/office-runtime-service.js";

const tokenConfig = {
  audience: "dachbyte-office-web",
  issuer: "dachbyte-office-api",
  accessTokenSecret: "test-secret-with-at-least-thirty-two-bytes!",
  accessTokenTtlSeconds: 600,
  refreshTokenTtlSeconds: 604800,
  secureCookies: false,
};
const password = "Correct-Horse-Battery-Staple-2026";

describe("Office runtime routes", () => {
  let authRepository: InMemoryAuthRepository;

  beforeEach(async () => {
    authRepository = new InMemoryAuthRepository();
    await authRepository.seedUser({
      active: true,
      email: "admin@example.com",
      id: "11111111-1111-4111-8111-111111111111",
      name: "Admin Master",
      passwordHash: await hashPassword(password),
      role: "admin_master",
      sessionVersion: 1,
    });
  });

  it("returns an authenticated authoritative snapshot and establishes the Office session cookie", async () => {
    const runtime: OfficeRuntimeService = {
      eventsAfter: async () => [],
      snapshotForOffice: async () => ({
        agents: [],
        alerts: [],
        approvals: [],
        eventSequence: 12,
        meetings: [],
        schedulePhase: "WORKDAY",
        trustLevel: "supervised",
      }),
    };
    const server = buildServer({
      authService: createAuthService({
        repository: authRepository,
        tokenConfig,
      }),
      authTokenConfig: tokenConfig,
      officeRuntimeService: runtime,
    });
    const login = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "admin@example.com", password },
    });
    const response = await server.inject({
      headers: { authorization: `Bearer ${login.json().accessToken}` },
      method: "GET",
      url: "/api/office/runtime-snapshot?officeId=office-1",
    });

    const cookies = login.headers["set-cookie"];
    expect(
      Array.isArray(cookies) ? cookies.join(";") : (cookies ?? ""),
    ).toContain("office_access_token=");
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.json()).toMatchObject({
      eventSequence: 12,
      schedulePhase: "WORKDAY",
    });
    await server.close();
  });
});
