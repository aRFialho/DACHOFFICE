import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { registerAuthRoutes, type AuthService, type AuthTokenConfig } from './modules/auth/index.js';
import { registerAgentRoutes } from './modules/admin/agent-routes.js';
import type { AgentService } from './modules/admin/agent-service.js';
import { registerOfficeRoutes } from './modules/admin/office-routes.js';
import type { OfficeService } from './modules/admin/office-service.js';

export interface BuildServerOptions {
  authService?: AuthService;
  authTokenConfig?: AuthTokenConfig;
  agentService?: AgentService;
  officeService?: OfficeService;
}

export const buildServer = (options: BuildServerOptions = {}) => {
  const server = Fastify({ logger: false });
  server.register(cookie);
  server.get('/health', async () => ({ service: 'dachbyte-office-api', status: 'ok' }));
  if (options.authService && options.authTokenConfig) {
    registerAuthRoutes(server, { authService: options.authService, tokenConfig: options.authTokenConfig });
  }
  if (options.authService && options.officeService) {
    registerOfficeRoutes(server, { authService: options.authService, officeService: options.officeService });
  }
  if (options.authService && options.agentService) {
    registerAgentRoutes(server, { authService: options.authService, agentService: options.agentService });
  }
  return server;
};
