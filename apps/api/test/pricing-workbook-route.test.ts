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
const taskId = "44444444-4444-4444-8444-444444444444";

describe("pricing workbook route", () => {
  let repository: InMemoryAuthRepository;
  beforeEach(async () => {
    repository = new InMemoryAuthRepository();
    await repository.seedUser({
      id: "55555555-5555-4555-8555-555555555555",
      name: "Admin",
      email: "admin@example.com",
      role: "admin_master",
      active: true,
      passwordHash: await hashPassword(password),
      sessionVersion: 1,
    });
  });

  it("downloads only the persisted XLSX for an authenticated admin task", async () => {
    const server = buildServer({
      authService: createAuthService({ repository, tokenConfig }),
      authTokenConfig: tokenConfig,
      pricingSimulationService: {
        create: async () => ({ id: taskId, status: "queued" as const }),
        getReport: async () => ({ status: "not_found" as const }),
        getWorkbook: async (id: string) =>
          id === taskId
            ? {
                status: "found" as const,
                content: Buffer.from("PKxlsx"),
                mediaType:
                  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" as const,
              }
            : { status: "not_found" as const },
      } as never,
    });
    const login = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "admin@example.com", password },
    });
    const response = await server.inject({
      method: "GET",
      url: `/v1/pricing/simulations/${taskId}/workbook`,
      headers: { authorization: `Bearer ${login.json().accessToken}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(response.headers["content-disposition"]).toContain(".xlsx");
    expect(response.body).toBe("PKxlsx");
    await server.close();
  });
});
