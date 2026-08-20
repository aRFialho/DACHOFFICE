import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AuthService } from './service.js';
import type { AuthTokenConfig } from './types.js';

const refreshCookieName = 'office_refresh_token';

const noStore = (reply: FastifyReply) => reply.header('cache-control', 'no-store');

const unauthorized = (reply: FastifyReply) =>
  noStore(reply).code(401).send({ error: 'unauthorized' });

const invalidCredentials = (reply: FastifyReply) =>
  noStore(reply).code(401).send({ error: 'invalid_credentials' });

const asLoginInput = (body: unknown): { email: string; password: string } | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const candidate = body as Record<string, unknown>;
  if (typeof candidate.email !== 'string' || typeof candidate.password !== 'string') return null;
  if (candidate.email.length > 320 || candidate.password.length > 1024) return null;
  return { email: candidate.email, password: candidate.password };
};

const bearerToken = (request: FastifyRequest): string | null => {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
};

const sendSession = (
  reply: FastifyReply,
  result: { accessToken: string; expiresIn: number; refreshToken: string },
  config: AuthTokenConfig,
) =>
  noStore(reply)
    .setCookie(refreshCookieName, result.refreshToken, {
      httpOnly: true,
      secure: config.secureCookies,
      sameSite: 'strict',
      path: '/v1/auth',
      maxAge: config.refreshTokenTtlSeconds,
    })
    .send({
      accessToken: result.accessToken,
      tokenType: 'Bearer',
      expiresIn: result.expiresIn,
    });

export const registerAuthRoutes = (
  server: FastifyInstance,
  options: { authService: AuthService; tokenConfig: AuthTokenConfig },
): void => {
  const { authService, tokenConfig } = options;

  server.post('/v1/auth/login', { config: { bodyLimit: 2048 } }, async (request, reply) => {
    const input = asLoginInput(request.body);
    if (!input) return invalidCredentials(reply);
    try {
      return sendSession(reply, await authService.login(input.email, input.password), tokenConfig);
    } catch {
      return invalidCredentials(reply);
    }
  });

  server.post('/v1/auth/refresh', async (request, reply) => {
    const refreshToken = request.cookies[refreshCookieName];
    if (!refreshToken) return unauthorized(reply);
    try {
      return sendSession(reply, await authService.refresh(refreshToken), tokenConfig);
    } catch {
      return unauthorized(reply);
    }
  });

  server.post('/v1/auth/logout', async (request, reply) => {
    const refreshToken = request.cookies[refreshCookieName];
    if (refreshToken) await authService.logout(refreshToken);
    return noStore(reply)
      .clearCookie(refreshCookieName, { path: '/v1/auth' })
      .code(204)
      .send();
  });

  server.get('/v1/auth/me', async (request, reply) => {
    const token = bearerToken(request);
    if (!token) return unauthorized(reply);
    try {
      const actor = await authService.authenticate(token);
      return noStore(reply).send({ user: actor.user });
    } catch {
      return unauthorized(reply);
    }
  });
};
