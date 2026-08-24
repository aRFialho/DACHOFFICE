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

class RecordingCatalogSyncRequestService {
  readonly requests: Array<{ integrationId?: string }> = [];

  async requestSync(input: {
    integrationId?: string;
  }): Promise<{ runId: string }> {
    this.requests.push(input);
    return { runId: "run-1" };
  }
}

describe("catalog sync route", () => {
  let repository: InMemoryAuthRepository;

  beforeEach(async () => {
    repository = new InMemoryAuthRepository();
    await repository.seedUser({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Admin Master",
      email: "admin@example.com",
      role: "admin_master",
      active: true,
      passwordHash: await hashPassword(password),
      sessionVersion: 1,
    });
  });

  it("rejects a sync request without an Admin Master token", async () => {
    const server = buildServer({
      authService: createAuthService({ repository, tokenConfig }),
      authTokenConfig: tokenConfig,
      catalogSyncRequestService: new RecordingCatalogSyncRequestService(),
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/integrations/tray/catalog-sync",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "unauthorized" });
    await server.close();
  });

  it("queues an Admin Master sync and returns its run id without provider work", async () => {
    const service = new RecordingCatalogSyncRequestService();
    const server = buildServer({
      authService: createAuthService({ repository, tokenConfig }),
      authTokenConfig: tokenConfig,
      catalogSyncRequestService: service,
    });
    const login = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "admin@example.com", password },
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/integrations/tray/catalog-sync",
      headers: { authorization: `Bearer ${login.json().accessToken}` },
      payload: { integrationId: "11111111-1111-4111-8111-111111111111" },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ runId: "run-1" });
    expect(service.requests).toEqual([
      { integrationId: "11111111-1111-4111-8111-111111111111" },
    ]);
    await server.close();
  });

  it("rejects a non-UUID integration selection before queuing work", async () => {
    const service = new RecordingCatalogSyncRequestService();
    const server = buildServer({
      authService: createAuthService({ repository, tokenConfig }),
      authTokenConfig: tokenConfig,
      catalogSyncRequestService: service,
    });
    const login = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "admin@example.com", password },
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/integrations/tray/catalog-sync",
      headers: { authorization: `Bearer ${login.json().accessToken}` },
      payload: { integrationId: "not-a-uuid" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_catalog_sync_input" });
    expect(service.requests).toEqual([]);
    await server.close();
  });
});
