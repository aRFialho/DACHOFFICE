import type { AuthTokenConfig } from "./types.js";

type Environment = Record<string, string | undefined>;

const required = (environment: Environment, key: string): string => {
  const value = environment[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
};

const positiveInteger = (
  value: string | undefined,
  fallback: number,
  key: string,
): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer`);
  }
  return parsed;
};

export interface AuthRuntimeConfig {
  databaseUrl: string;
  tokenConfig: AuthTokenConfig;
}

export const loadAuthRuntimeConfig = (
  environment: Environment,
): AuthRuntimeConfig => {
  const accessTokenSecret = required(environment, "JWT_ACCESS_SECRET");
  if (Buffer.byteLength(accessTokenSecret, "utf8") < 32) {
    throw new Error("JWT_ACCESS_SECRET must contain at least 32 bytes");
  }

  return {
    databaseUrl: required(environment, "OFFICE_DATABASE_URL"),
    tokenConfig: {
      issuer: environment.JWT_ACCESS_ISSUER?.trim() || "dachbyte-office-api",
      audience:
        environment.JWT_ACCESS_AUDIENCE?.trim() || "dachbyte-office-web",
      accessTokenSecret,
      accessTokenTtlSeconds: positiveInteger(
        environment.JWT_ACCESS_TTL_SECONDS,
        900,
        "JWT_ACCESS_TTL_SECONDS",
      ),
      refreshTokenTtlSeconds: positiveInteger(
        environment.JWT_REFRESH_TTL_SECONDS,
        604800,
        "JWT_REFRESH_TTL_SECONDS",
      ),
      secureCookies: environment.NODE_ENV === "production",
    },
  };
};
