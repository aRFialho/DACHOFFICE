import cookie from "@fastify/cookie";
import Fastify from "fastify";
import {
  registerAuthRoutes,
  type AuthService,
  type AuthTokenConfig,
} from "./modules/auth/index.js";
import { registerAgentLifecycleRoutes } from "./modules/admin/agent-lifecycle-routes.js";
import type { AgentLifecycleService } from "./modules/admin/agent-lifecycle-service.js";
import { registerAgentRoutes } from "./modules/admin/agent-routes.js";
import type { AgentService } from "./modules/admin/agent-service.js";
import { registerOfficeRoutes } from "./modules/admin/office-routes.js";
import type { OfficeService } from "./modules/admin/office-service.js";
import { registerTaskRoutes } from "./modules/tasks/task-routes.js";
import type { TaskService } from "./modules/tasks/task-service.js";
import {
  registerCatalogRoutes,
  type CatalogSyncRequestService,
} from "./modules/catalog/catalog-routes.js";

export interface BuildServerOptions {
  authService?: AuthService;
  authTokenConfig?: AuthTokenConfig;
  agentService?: AgentService;
  agentLifecycleService?: AgentLifecycleService;
  officeService?: OfficeService;
  taskService?: TaskService;
  catalogSyncRequestService?: CatalogSyncRequestService;
}

export const buildServer = (options: BuildServerOptions = {}) => {
  const server = Fastify({ logger: false });
  server.register(cookie);
  server.get("/health", async () => ({
    service: "dachbyte-office-api",
    status: "ok",
  }));
  if (options.authService && options.authTokenConfig) {
    registerAuthRoutes(server, {
      authService: options.authService,
      tokenConfig: options.authTokenConfig,
    });
  }
  if (options.authService && options.officeService) {
    registerOfficeRoutes(server, {
      authService: options.authService,
      officeService: options.officeService,
    });
  }
  if (options.authService && options.agentService) {
    registerAgentRoutes(server, {
      authService: options.authService,
      agentService: options.agentService,
    });
  }
  if (options.authService && options.agentLifecycleService) {
    registerAgentLifecycleRoutes(server, {
      authService: options.authService,
      agentLifecycleService: options.agentLifecycleService,
    });
  }
  if (options.authService && options.taskService) {
    registerTaskRoutes(server, {
      authService: options.authService,
      taskService: options.taskService,
    });
  }
  if (options.authService && options.catalogSyncRequestService) {
    registerCatalogRoutes(server, {
      authService: options.authService,
      catalogSyncRequestService: options.catalogSyncRequestService,
    });
  }
  return server;
};
