import { beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/app.js";
import type { FinanceService } from "../src/modules/finance/finance-service.js";
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

class FinanceReadService implements FinanceService {
  async getLatestRuleVersion() {
    return {
      status: "found" as const,
      ruleVersion: {
        id: "22222222-2222-4222-8222-222222222222",
        ruleSetId: "33333333-3333-4333-8333-333333333333",
        version: 3,
        rulesJson: { rawCodeMappings: {} },
        createdAt: "2026-08-24T10:00:00.000Z",
      },
    };
  }

  async getLatestMarginSnapshot() {
    return { status: "not_found" as const };
  }

  async createRuleVersion() {
    return { status: "unchanged" as const };
  }
}

describe("finance read routes", () => {
  let repository: InMemoryAuthRepository;

  beforeEach(async () => {
    repository = new InMemoryAuthRepository();
    await repository.seedUser({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Admin Master",
      email: "admin@example.com",
      role: "admin_master",
      active: true,
      passwordHash: await hashPassword(password),
      sessionVersion: 1,
    });
  });

  it("returns only the latest office-scoped finance rule fields to an authenticated Admin Master", async () => {
    const server = buildServer({
      authService: createAuthService({ repository, tokenConfig }),
      authTokenConfig: tokenConfig,
      financeService: new FinanceReadService(),
    });
    const login = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "admin@example.com", password },
    });

    const response = await server.inject({
      method: "GET",
      url: `/v1/admin/offices/${officeId}/finance/rules/latest`,
      headers: { authorization: `Bearer ${login.json().accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ruleVersion: {
        id: "22222222-2222-4222-8222-222222222222",
        ruleSetId: "33333333-3333-4333-8333-333333333333",
        version: 3,
        rulesJson: { rawCodeMappings: {} },
        createdAt: "2026-08-24T10:00:00.000Z",
      },
    });
    await server.close();
  });
});
