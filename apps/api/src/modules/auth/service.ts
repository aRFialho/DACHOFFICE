import { createHash, randomBytes, randomUUID } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { verifyPassword } from "./password.js";
import type {
  AuthRepository,
  AuthResult,
  AuthSession,
  AuthTokenConfig,
  AuthenticatedActor,
  AuthUser,
} from "./types.js";

const tokenEncoder = new TextEncoder();
const refreshTokenBytes = 32;

export class AuthFailure extends Error {
  constructor() {
    super("Authentication failed");
  }
}

const hashRefreshToken = (token: string): string =>
  createHash("sha256").update(token).digest("base64url");

const createRefreshToken = (): string =>
  randomBytes(refreshTokenBytes).toString("base64url");

const publicUser = (user: AuthUser): AuthenticatedActor["user"] => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
});

export class AuthService {
  readonly #repository: AuthRepository;
  readonly #config: AuthTokenConfig;
  readonly #key: Uint8Array;

  constructor(repository: AuthRepository, config: AuthTokenConfig) {
    if (Buffer.byteLength(config.accessTokenSecret, "utf8") < 32) {
      throw new Error("JWT_ACCESS_SECRET must contain at least 32 bytes");
    }
    this.#repository = repository;
    this.#config = config;
    this.#key = tokenEncoder.encode(config.accessTokenSecret);
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const user = await this.#repository.findUserByEmail(email);
    if (
      !user ||
      !user.active ||
      !(await verifyPassword(user.passwordHash, password))
    ) {
      throw new AuthFailure();
    }
    return this.#createResult(user);
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    const tokenHash = hashRefreshToken(refreshToken);
    const session =
      await this.#repository.findSessionByRefreshTokenHash(tokenHash);
    if (!session) throw new AuthFailure();

    const user = await this.#repository.findUserById(session.userId);
    if (!user || !user.active) throw new AuthFailure();

    const result = await this.#createResult(user);
    const replacement = this.#sessionFor(user.id, result.refreshToken);
    const rotated = await this.#repository.rotateSession(
      session.id,
      tokenHash,
      replacement,
    );
    if (!rotated) throw new AuthFailure();
    return result;
  }

  async logout(refreshToken: string): Promise<void> {
    const session = await this.#repository.findSessionByRefreshTokenHash(
      hashRefreshToken(refreshToken),
    );
    if (session) await this.#repository.revokeSession(session.id);
  }

  async authenticate(accessToken: string): Promise<AuthenticatedActor> {
    try {
      const { payload, protectedHeader } = await jwtVerify(
        accessToken,
        this.#key,
        {
          algorithms: ["HS256"],
          issuer: this.#config.issuer,
          audience: this.#config.audience,
        },
      );
      if (protectedHeader.alg !== "HS256") throw new AuthFailure();
      const userId = payload.sub;
      const sessionId =
        typeof payload.sid === "string" ? payload.sid : undefined;
      const sessionVersion =
        typeof payload.sv === "number" ? payload.sv : undefined;
      if (!userId || !sessionId || sessionVersion === undefined)
        throw new AuthFailure();

      const [user, session] = await Promise.all([
        this.#repository.findUserById(userId),
        this.#repository.findSessionById(sessionId),
      ]);
      if (
        !user ||
        !user.active ||
        user.sessionVersion !== sessionVersion ||
        !session ||
        session.userId !== user.id ||
        session.revokedAt ||
        session.expiresAt <= new Date()
      ) {
        throw new AuthFailure();
      }
      return { user: publicUser(user), sessionId };
    } catch {
      throw new AuthFailure();
    }
  }

  async #createResult(user: AuthUser): Promise<AuthResult> {
    const refreshToken = createRefreshToken();
    const session = this.#sessionFor(user.id, refreshToken);
    await this.#repository.createSession(session);
    const accessToken = await new SignJWT({
      role: user.role,
      sid: session.id,
      sv: user.sessionVersion,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT", kid: "access-v1" })
      .setIssuedAt()
      .setNotBefore("0s")
      .setIssuer(this.#config.issuer)
      .setAudience(this.#config.audience)
      .setSubject(user.id)
      .setExpirationTime(`${this.#config.accessTokenTtlSeconds}s`)
      .sign(this.#key);
    return {
      accessToken,
      expiresIn: this.#config.accessTokenTtlSeconds,
      refreshToken,
    };
  }

  #sessionFor(userId: string, refreshToken: string): AuthSession {
    return {
      id: randomUUID(),
      userId,
      refreshTokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(
        Date.now() + this.#config.refreshTokenTtlSeconds * 1000,
      ),
      revokedAt: null,
    };
  }
}

export const createAuthService = (options: {
  repository: AuthRepository;
  tokenConfig: AuthTokenConfig;
}): AuthService => new AuthService(options.repository, options.tokenConfig);
