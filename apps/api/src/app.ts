import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { registerAuthRoutes, type AuthService, type AuthTokenConfig } from './modules/auth/index.js';

export interface BuildServerOptions {
  authService?: AuthService;
  authTokenConfig?: AuthTokenConfig;
}

export const buildServer = (options: BuildServerOptions = {}) => {
  const server = Fastify({ logger: false });

  server.register(cookie);

  server.get('/health', async () => ({
    service: 'dachbyte-office-api',
    status: 'ok',
  }));

  if (options.authService && options.authTokenConfig) {
    registerAuthRoutes(server, {
      authService: options.authService,
      tokenConfig: options.authTokenConfig,
    });
  }

  return server;
};
