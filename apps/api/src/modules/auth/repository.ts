import type { AuthRepository, AuthSession, AuthUser } from "./types.js";

const normalizedEmail = (email: string) =>
  email.trim().toLocaleLowerCase("en-US");

const copyUser = (user: AuthUser): AuthUser => ({ ...user });

const copySession = (session: AuthSession): AuthSession => ({
  ...session,
  expiresAt: new Date(session.expiresAt),
  revokedAt: session.revokedAt ? new Date(session.revokedAt) : null,
});

/** In-memory adapter used only by tests. Production uses the Postgres adapter. */
export class InMemoryAuthRepository implements AuthRepository {
  readonly #users = new Map<string, AuthUser>();
  readonly #usersByEmail = new Map<string, string>();
  readonly #sessions = new Map<string, AuthSession>();

  async seedUser(user: AuthUser): Promise<void> {
    this.#users.set(user.id, copyUser(user));
    this.#usersByEmail.set(normalizedEmail(user.email), user.id);
  }

  async setUserActive(userId: string, active: boolean): Promise<void> {
    const user = this.#users.get(userId);
    if (!user) throw new Error("User not found");
    this.#users.set(userId, { ...user, active });
  }

  async findUserByEmail(email: string): Promise<AuthUser | null> {
    const userId = this.#usersByEmail.get(normalizedEmail(email));
    const user = userId ? this.#users.get(userId) : undefined;
    return user ? copyUser(user) : null;
  }

  async findUserById(id: string): Promise<AuthUser | null> {
    const user = this.#users.get(id);
    return user ? copyUser(user) : null;
  }

  async findSessionById(id: string): Promise<AuthSession | null> {
    const session = this.#sessions.get(id);
    return session ? copySession(session) : null;
  }

  async findSessionByRefreshTokenHash(
    tokenHash: string,
  ): Promise<AuthSession | null> {
    const session = [...this.#sessions.values()].find(
      (item) => item.refreshTokenHash === tokenHash,
    );
    return session ? copySession(session) : null;
  }

  async createSession(session: AuthSession): Promise<void> {
    this.#sessions.set(session.id, copySession(session));
  }

  async rotateSession(
    sessionId: string,
    expectedRefreshTokenHash: string,
    replacement: AuthSession,
  ): Promise<boolean> {
    const current = this.#sessions.get(sessionId);
    if (
      !current ||
      current.revokedAt ||
      current.expiresAt <= new Date() ||
      current.refreshTokenHash !== expectedRefreshTokenHash
    ) {
      return false;
    }

    this.#sessions.set(sessionId, { ...current, revokedAt: new Date() });
    this.#sessions.set(replacement.id, copySession(replacement));
    return true;
  }

  async revokeSession(sessionId: string): Promise<void> {
    const session = this.#sessions.get(sessionId);
    if (session && !session.revokedAt) {
      this.#sessions.set(sessionId, { ...session, revokedAt: new Date() });
    }
  }
}
