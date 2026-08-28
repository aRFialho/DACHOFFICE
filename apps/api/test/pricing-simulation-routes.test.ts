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
const password = "Correct-Horse-Battery-Staple-2026";
const officeId = "11111111-1111-4111-8111-111111111111";
const agentId = "22222222-2222-4222-8222-222222222222";

describe("pricing simulation routes", () => {
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
  it("queues a validated pricing simulation for the authenticated admin", async () => {
    const calls: unknown[] = [];
    const pricingSimulationService = {
      create: async (input: unknown) => {
        calls.push(input);
        return { id: "44444444-4444-4444-8444-444444444444", status: "queued" };
      },
      getReport: async () => ({ status: "not_found" as const }),
    };
    const server = buildServer({
      authService: createAuthService({
        repository: authRepository,
        tokenConfig,
      }),
      authTokenConfig: tokenConfig,
      pricingSimulationService,
    } as never);
    const login = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "admin@example.com", password },
    });
    const response = await server.inject({
      method: "POST",
      url: "/v1/pricing/simulations",
      headers: { authorization: `Bearer ${login.json().accessToken}` },
      payload: {
        officeId,
        agentId,
        skus: ["SKU-1"],
        channel: "tray",
        discountPercent: "10.0000",
        periodStart: "2026-08-01T00:00:00.000Z",
        periodEnd: "2026-08-31T23:59:59.999Z",
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      task: { id: "44444444-4444-4444-8444-444444444444", status: "queued" },
    });
    expect(calls).toEqual([
      {
        officeId,
        agentId,
        requestedByUserId: "55555555-5555-4555-8555-555555555555",
        skus: ["SKU-1"],
        channel: "tray",
        discountPercent: "10.0000",
        periodStart: "2026-08-01T00:00:00.000Z",
        periodEnd: "2026-08-31T23:59:59.999Z",
      },
    ]);
    await server.close();
  });
});
