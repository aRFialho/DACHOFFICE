import type { Pool, PoolClient } from "pg";
import type { AuthRepository, AuthSession, AuthUser } from "./types.js";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: "admin_master";
  active: boolean;
  password_hash: string;
  session_version: number;
};

type SessionRow = {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
};

const toUser = (row: UserRow): AuthUser => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  active: row.active,
  passwordHash: row.password_hash,
  sessionVersion: row.session_version,
});

const toSession = (row: SessionRow): AuthSession => ({
  id: row.id,
  userId: row.user_id,
  refreshTokenHash: row.refresh_token_hash,
  expiresAt: row.expires_at,
  revokedAt: row.revoked_at,
});

export class PostgresAuthRepository implements AuthRepository {
  constructor(private readonly pool: Pool) {}

  async findUserByEmail(email: string): Promise<AuthUser | null> {
    const result = await this.pool.query<UserRow>(
      `SELECT id, name, email, role, active, password_hash, session_version
       FROM app_user WHERE lower(email) = lower($1)`,
      [email.trim()],
    );
    const row = result.rows[0];
    return row ? toUser(row) : null;
  }

  async findUserById(id: string): Promise<AuthUser | null> {
    const result = await this.pool.query<UserRow>(
      `SELECT id, name, email, role, active, password_hash, session_version
       FROM app_user WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    return row ? toUser(row) : null;
  }

  async findSessionById(id: string): Promise<AuthSession | null> {
    const result = await this.pool.query<SessionRow>(
      `SELECT id, user_id, refresh_token_hash, expires_at, revoked_at
       FROM auth_session WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    return row ? toSession(row) : null;
  }

  async findSessionByRefreshTokenHash(
    tokenHash: string,
  ): Promise<AuthSession | null> {
    const result = await this.pool.query<SessionRow>(
      `SELECT id, user_id, refresh_token_hash, expires_at, revoked_at
       FROM auth_session WHERE refresh_token_hash = $1`,
      [tokenHash],
    );
    const row = result.rows[0];
    return row ? toSession(row) : null;
  }

  async createSession(session: AuthSession): Promise<void> {
    await this.pool.query(
      `INSERT INTO auth_session (id, user_id, refresh_token_hash, expires_at, revoked_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        session.id,
        session.userId,
        session.refreshTokenHash,
        session.expiresAt,
        session.revokedAt,
      ],
    );
  }

  async rotateSession(
    sessionId: string,
    expectedRefreshTokenHash: string,
    replacement: AuthSession,
  ): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const revoked = await client.query(
        `UPDATE auth_session SET revoked_at = now()
         WHERE id = $1 AND refresh_token_hash = $2 AND revoked_at IS NULL AND expires_at > now()`,
        [sessionId, expectedRefreshTokenHash],
      );
      if (revoked.rowCount !== 1) {
        await client.query("ROLLBACK");
        return false;
      }
      await this.insertSession(client, replacement);
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.pool.query(
      "UPDATE auth_session SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL",
      [sessionId],
    );
  }

  async insertSession(client: PoolClient, session: AuthSession): Promise<void> {
    await client.query(
      `INSERT INTO auth_session (id, user_id, refresh_token_hash, expires_at, revoked_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        session.id,
        session.userId,
        session.refreshTokenHash,
        session.expiresAt,
        session.revokedAt,
      ],
    );
  }
}
