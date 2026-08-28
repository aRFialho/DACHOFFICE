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
  queueCalls = 0;

  async getAgentEligibility() {
    this.eligibilityCalls += 1;
    return null;
  }

  async queueMarginAnalysis() {
    this.queueCalls += 1;
    return { status: "agent_invalid" as const };
  }

  async getReportForTask() {
    return { status: "not_found" as const };
  }
}

describe("margin analysis timestamp validation", () => {
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

  it.each([
    "2026-08-01 00:00:00Z",
    "2026-08-01Z",
    "2026-02-30T00:00:00Z",
    "2026-08-01T00:00:00+00:00",
  ])(
    "rejects non-strict UTC period values before eligibility or writes: %s",
    async (periodStart) => {
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
          periodStart,
          periodEnd: "2026-08-31T23:59:59Z",
        },
      });
      expect(response.statusCode).toBe(400);
      expect(repository.eligibilityCalls).toBe(0);
      expect(repository.queueCalls).toBe(0);
      await server.close();
    },
  );
});
