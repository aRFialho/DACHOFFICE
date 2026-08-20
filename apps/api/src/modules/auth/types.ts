export type UserRole = "admin_master";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  passwordHash: string;
  sessionVersion: number;
}

export interface AuthSession {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface AuthRepository {
  findUserByEmail(email: string): Promise<AuthUser | null>;
  findUserById(id: string): Promise<AuthUser | null>;
  findSessionById(id: string): Promise<AuthSession | null>;
  findSessionByRefreshTokenHash(tokenHash: string): Promise<AuthSession | null>;
  createSession(session: AuthSession): Promise<void>;
  rotateSession(
    sessionId: string,
    expectedRefreshTokenHash: string,
    replacement: AuthSession,
  ): Promise<boolean>;
  revokeSession(sessionId: string): Promise<void>;
}

export interface AuthTokenConfig {
  issuer: string;
  audience: string;
  accessTokenSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  secureCookies: boolean;
}

export interface AuthenticatedActor {
  user: Pick<AuthUser, "id" | "name" | "email" | "role">;
  sessionId: string;
}

export interface AuthResult {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
}
