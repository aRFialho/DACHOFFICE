import pg from "pg";
import { buildServer } from "./app.js";
import { PostgresAgentLifecycleRepository } from "./modules/admin/postgres-agent-lifecycle-repository.js";
import { createAgentLifecycleService } from "./modules/admin/agent-lifecycle-service.js";
import { PostgresAgentRepository } from "./modules/admin/postgres-agent-repository.js";
import { createAgentService } from "./modules/admin/agent-service.js";
import { PostgresOfficeRepository } from "./modules/admin/postgres-office-repository.js";
import { createOfficeService } from "./modules/admin/office-service.js";
import { PostgresAuthRepository } from "./modules/auth/postgres-repository.js";
import { loadAuthRuntimeConfig } from "./modules/auth/runtime-config.js";
import { createAuthService } from "./modules/auth/service.js";
import { PostgresTaskRepository } from "./modules/tasks/postgres-task-repository.js";
import { createTaskService } from "./modules/tasks/task-service.js";
import { PostgresCatalogSyncRequestService } from "./modules/catalog/catalog-routes.js";
import { createStoreGeneralRuntime } from "./modules/catalog/postgres-store-general-runtime.js";
import { createFinanceRuntime } from "./modules/finance/postgres-finance-runtime.js";
import { MarginAnalysisService } from "./modules/margin/margin-analysis-service.js";
import { createMarginAnalysisRuntime } from "./modules/margin/postgres-margin-analysis-runtime.js";

const runtimeConfig = loadAuthRuntimeConfig(process.env);
const pool = new pg.Pool({ connectionString: runtimeConfig.databaseUrl });
const authService = createAuthService({
  repository: new PostgresAuthRepository(pool),
  tokenConfig: runtimeConfig.tokenConfig,
});
const agentLifecycleService = createAgentLifecycleService(
  new PostgresAgentLifecycleRepository(pool),
);
const agentService = createAgentService(new PostgresAgentRepository(pool));
const officeService = createOfficeService(new PostgresOfficeRepository(pool));
const taskService = createTaskService(new PostgresTaskRepository(pool));
const catalogSyncRequestService = new PostgresCatalogSyncRequestService(pool);
const storeGeneralTools = createStoreGeneralRuntime(pool);
const financeRuntime = createFinanceRuntime(pool);
const marginRuntime = createMarginAnalysisRuntime(pool);
const marginAnalysisService = new MarginAnalysisService(
  marginRuntime.marginAnalysisRepository,
);
const server = buildServer({
  authService,
  authTokenConfig: runtimeConfig.tokenConfig,
  agentService,
  agentLifecycleService,
  officeService,
  taskService,
  catalogSyncRequestService,
  storeGeneralTools,
  financeService: financeRuntime.financeService,
  financeTools: financeRuntime.financeTools,
  marginAnalysisService,
  marginTools: marginRuntime.marginTools,
});

server.addHook("onClose", async () => {
  await pool.end();
});

const start = async (): Promise<void> => {
  await server.listen({
    host: "0.0.0.0",
    port: Number(process.env.PORT ?? 3000),
  });
};

start().catch(async (error: unknown) => {
  await server.close();
  throw error;
});
