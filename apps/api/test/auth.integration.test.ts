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

describe("authentication endpoints", () => {
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

  it("does not enumerate accounts during login", async () => {
    const server = buildServer({
      authService: createAuthService({ repository, tokenConfig }),
      authTokenConfig: tokenConfig,
    });
    const response = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "unknown@example.com", password },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "invalid_credentials" });
    await server.close();
  });

  it("rejects an existing access token after deactivation", async () => {
    const server = buildServer({
      authService: createAuthService({ repository, tokenConfig }),
      authTokenConfig: tokenConfig,
    });
    const login = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "admin@example.com", password },
    });
    await repository.setUserActive(
      "11111111-1111-4111-8111-111111111111",
      false,
    );
    const me = await server.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: { authorization: `Bearer ${login.json().accessToken}` },
    });
    expect(me.statusCode).toBe(401);
    await server.close();
  });
});
