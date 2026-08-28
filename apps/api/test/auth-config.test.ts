import { describe, expect, it } from "vitest";
import { loadAuthRuntimeConfig } from "../src/modules/auth/runtime-config.js";

const environment = {
  OFFICE_DATABASE_URL: "postgresql://runtime.example.test/db",
  JWT_ACCESS_SECRET: "secure-test-secret-with-at-least-thirty-two-bytes",
};

describe("auth runtime configuration", () => {
  it("fails closed when the JWT secret is missing", () => {
    expect(() =>
      loadAuthRuntimeConfig({
        OFFICE_DATABASE_URL: environment.OFFICE_DATABASE_URL,
      }),
    ).toThrow("JWT_ACCESS_SECRET is required");
  });

  it("uses short-lived access tokens and secure cookies in production", () => {
    expect(
      loadAuthRuntimeConfig({ ...environment, NODE_ENV: "production" }),
    ).toEqual({
      databaseUrl: environment.OFFICE_DATABASE_URL,
      tokenConfig: {
        issuer: "dachbyte-office-api",
        audience: "dachbyte-office-web",
        accessTokenSecret: environment.JWT_ACCESS_SECRET,
        accessTokenTtlSeconds: 900,
        refreshTokenTtlSeconds: 604800,
        secureCookies: true,
      },
    });
  });
});
