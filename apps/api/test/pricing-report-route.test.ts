import { beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/app.js";
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
const taskId = "44444444-4444-4444-8444-444444444444";

describe("pricing report route", () => {
  let repository: InMemoryAuthRepository;
  beforeEach(async () => {
    repository = new InMemoryAuthRepository();
    await repository.seedUser({
      id: "55555555-5555-4555-8555-555555555555",
      name: "Admin",
      email: "admin@example.com",
      role: "admin_master",
      active: true,
      passwordHash: await hashPassword("Correct-Horse-Battery-Staple-2026"),
      sessionVersion: 1,
    });
  });
  it("reads an immutable report by task id for the authenticated admin", async () => {
    const server = buildServer({
      authService: createAuthService({ repository, tokenConfig }),
      authTokenConfig: tokenConfig,
      pricingSimulationService: {
        create: async () => ({ id: taskId, status: "queued" as const }),
        getReport: async (id: string) =>
          id === taskId
            ? { status: "found" as const, report: { status: "completed" } }
            : { status: "not_found" as const },
        getWorkbook: async () => ({ status: "not_found" as const }),
      },
    });
    const login = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        email: "admin@example.com",
        password: "Correct-Horse-Battery-Staple-2026",
      },
    });
    const response = await server.inject({
      method: "GET",
      url: `/v1/pricing/simulations/${taskId}`,
      headers: { authorization: `Bearer ${login.json().accessToken}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ report: { status: "completed" } });
    await server.close();
  });
});
