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
import type { StoreGeneralTools } from "./modules/catalog/store-general-tools.js";
import {
  registerCatalogRoutes,
  type CatalogSyncRequestService,
} from "./modules/catalog/catalog-routes.js";
import { registerFinanceRoutes } from "./modules/finance/finance-routes.js";
import type { FinanceService } from "./modules/finance/finance-service.js";
import type { FinanceTools } from "./modules/finance/finance-tools.js";
import { registerMarginAnalysisRoutes } from "./modules/margin/margin-analysis-routes.js";
import type { MarginAnalysisService } from "./modules/margin/margin-analysis-service.js";
import type { MarginTools } from "./modules/margin/margin-tools.js";

import { registerPricingSimulationRoutes } from "./modules/pricing/pricing-simulation-routes.js";
import type { PricingSimulationEndpoint } from "./modules/pricing/pricing-simulation-routes.js";
export interface BuildServerOptions {
  authService?: AuthService;
  authTokenConfig?: AuthTokenConfig;
  agentService?: AgentService;
  agentLifecycleService?: AgentLifecycleService;
  officeService?: OfficeService;
  taskService?: TaskService;
  catalogSyncRequestService?: CatalogSyncRequestService;
  storeGeneralTools?: StoreGeneralTools;
  financeService?: FinanceService;
  financeTools?: FinanceTools;
  marginAnalysisService?: MarginAnalysisService;
  marginTools?: MarginTools;
  pricingSimulationService?: PricingSimulationEndpoint;
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
  if (options.storeGeneralTools) {
    server.decorate("storeGeneralTools", options.storeGeneralTools);
  }
  if (options.authService && options.catalogSyncRequestService) {
    registerCatalogRoutes(server, {
      authService: options.authService,
      catalogSyncRequestService: options.catalogSyncRequestService,
    });
  }
  if (options.financeTools) {
    server.decorate("financeTools", options.financeTools);
  }
  if (options.authService && options.financeService) {
    registerFinanceRoutes(server, {
      authService: options.authService,
      financeService: options.financeService,
    });
  }
  if (options.marginTools) {
    server.decorate("marginTools", options.marginTools);
  }
  if (options.authService && options.marginAnalysisService) {
    registerMarginAnalysisRoutes(server, {
      authService: options.authService,
      marginAnalysisService: options.marginAnalysisService,
    });
  }
  if (options.authService && options.pricingSimulationService) {
    registerPricingSimulationRoutes(server, {
      authService: options.authService,
      pricingSimulationService: options.pricingSimulationService,
    });
  }
  return server;
};
