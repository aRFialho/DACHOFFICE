import { describe, expect, it } from "vitest";
import {
  AuthFailure,
  AuthService,
  hashPassword,
} from "../src/modules/auth/index.js";
import type {
  AuthRepository,
  AuthSession,
  AuthTokenConfig,
  AuthUser,
} from "../src/modules/auth/types.js";

const tokenConfig: AuthTokenConfig = {
  audience: "dachbyte-office-web",
  issuer: "dachbyte-office-api",
  accessTokenSecret: "test-secret-with-at-least-thirty-two-bytes!",
  accessTokenTtlSeconds: 600,
  refreshTokenTtlSeconds: 604800,
  secureCookies: false,
};

class UniqueRefreshHashRepository implements AuthRepository {
  readonly users = new Map<string, AuthUser>();
  readonly sessions = new Map<string, AuthSession>();

  async seedUser(user: AuthUser): Promise<void> {
    this.users.set(user.id, { ...user });
  }

  async findUserByEmail(email: string): Promise<AuthUser | null> {
    return (
      [...this.users.values()].find(
        (user) => user.email.toLowerCase() === email.trim().toLowerCase(),
      ) ?? null
    );
  }

  async findUserById(id: string): Promise<AuthUser | null> {
    return this.users.get(id) ?? null;
  }

  async findSessionById(id: string): Promise<AuthSession | null> {
    return this.sessions.get(id) ?? null;
  }

  async findSessionByRefreshTokenHash(
    tokenHash: string,
  ): Promise<AuthSession | null> {
    return (
      [...this.sessions.values()].find(
        (session) => session.refreshTokenHash === tokenHash,
      ) ?? null
    );
  }

  async createSession(session: AuthSession): Promise<void> {
    this.assertUniqueRefreshHash(session.refreshTokenHash);
    this.sessions.set(session.id, { ...session });
  }

  async rotateSession(
    sessionId: string,
    expectedRefreshTokenHash: string,
    replacement: AuthSession,
  ): Promise<boolean> {
    const current = this.sessions.get(sessionId);
    if (
      !current ||
      current.revokedAt ||
      current.expiresAt <= new Date() ||
      current.refreshTokenHash !== expectedRefreshTokenHash
    ) {
      return false;
    }

    this.assertUniqueRefreshHash(replacement.refreshTokenHash);
    this.sessions.set(sessionId, { ...current, revokedAt: new Date() });
    this.sessions.set(replacement.id, { ...replacement });
    return true;
  }

  async revokeSession(sessionId: string): Promise<void> {
    const current = this.sessions.get(sessionId);
    if (current && !current.revokedAt) {
      this.sessions.set(sessionId, { ...current, revokedAt: new Date() });
    }
  }

  private assertUniqueRefreshHash(refreshTokenHash: string): void {
    if (
      [...this.sessions.values()].some(
        (session) => session.refreshTokenHash === refreshTokenHash,
      )
    ) {
      throw new Error("duplicate refresh_token_hash");
    }
  }
}

describe("AuthService refresh rotation", () => {
  it("rotates to exactly one replacement session and rejects reuse of the old token", async () => {
    const repository = new UniqueRefreshHashRepository();
    const password = "Correct-Horse-Battery-Staple-2026";
    await repository.seedUser({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Admin Master",
      email: "admin@example.com",
      role: "admin_master",
      active: true,
      passwordHash: await hashPassword(password),
      sessionVersion: 1,
    });
    const service = new AuthService(repository, tokenConfig);

    const login = await service.login("admin@example.com", password);
    expect(repository.sessions.size).toBe(1);

    const refreshed = await service.refresh(login.refreshToken);
    expect(repository.sessions.size).toBe(2);
    await expect(service.authenticate(refreshed.accessToken)).resolves.toMatchObject({
      user: { email: "admin@example.com" },
    });

    await expect(service.refresh(login.refreshToken)).rejects.toBeInstanceOf(
      AuthFailure,
    );
  });
});
