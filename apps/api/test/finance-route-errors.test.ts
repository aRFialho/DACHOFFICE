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

class FailingFinanceService implements FinanceService {
  async getLatestRuleVersion(): Promise<never> {
    throw new Error("database password must not be serialized");
  }
  async getLatestMarginSnapshot(): Promise<never> {
    throw new Error("database password must not be serialized");
  }
  async createRuleVersion() {
    return { status: "conflict" as const };
  }
}

describe("finance read route errors", () => {
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

  it("returns a fixed rule not-found outcome when a read dependency fails", async () => {
    const server = buildServer({
      authService: createAuthService({ repository, tokenConfig }),
      authTokenConfig: tokenConfig,
      financeService: new FailingFinanceService(),
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

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "finance_rule_not_found" });
    expect(response.body).not.toContain("database password");
    await server.close();
  });
});
