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
const ruleSetId = "22222222-2222-4222-8222-222222222222";
const orderHeaderId = "33333333-3333-4333-8333-333333333333";

class RecordingFinanceService implements FinanceService {
  creates: unknown[] = [];
  constructor(
    private readonly createStatus: "created" | "unchanged" | "conflict",
  ) {}

  async getLatestRuleVersion() {
    return { status: "not_found" as const };
  }
  async getLatestMarginSnapshot() {
    return { status: "not_found" as const };
  }
  async createRuleVersion(input: unknown) {
    this.creates.push(input);
    return this.createStatus === "created"
      ? { status: "created" as const, ruleVersionId: orderHeaderId }
      : { status: this.createStatus };
  }
}

describe("finance configuration route", () => {
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

  it("creates a strictly validated rule version and reports an unchanged retry without external work", async () => {
    const service = new RecordingFinanceService("unchanged");
    const server = buildServer({
      authService: createAuthService({ repository, tokenConfig }),
      authTokenConfig: tokenConfig,
      financeService: service,
    });
    const login = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "admin@example.com", password },
    });

    const response = await server.inject({
      method: "POST",
      url: `/v1/admin/offices/${officeId}/finance/rules`,
      headers: { authorization: `Bearer ${login.json().accessToken}` },
      payload: {
        ruleSetId,
        version: 2,
        rulesJson: { rawCodeMappings: {} },
        channelFeeRules: [
          {
            channel: "tray",
            componentType: "marketplace_commission",
            payer: "seller",
            feeMode: "percentage",
            value: "16.5000",
            source: "office_config",
            confidence: "ESTIMATED",
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "unchanged" });
    expect(service.creates).toEqual([
      expect.objectContaining({ officeId, ruleSetId, version: 2 }),
    ]);
    await server.close();
  });

  it("rejects an unsafe config version before invoking persistence", async () => {
    const service = new RecordingFinanceService("created");
    const server = buildServer({
      authService: createAuthService({ repository, tokenConfig }),
      authTokenConfig: tokenConfig,
      financeService: service,
    });
    const login = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "admin@example.com", password },
    });

    const response = await server.inject({
      method: "POST",
      url: `/v1/admin/offices/${officeId}/finance/rules`,
      headers: { authorization: `Bearer ${login.json().accessToken}` },
      payload: { ruleSetId, version: Number.MAX_SAFE_INTEGER + 1 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_finance_rule_input" });
    expect(service.creates).toEqual([]);
    await server.close();
  });
});
