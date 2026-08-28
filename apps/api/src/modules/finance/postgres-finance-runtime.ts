import type { Pool } from "pg";
import { ToolAuthorizationService } from "../policy/tool-authorization-service.js";
import { ToolRegistry } from "../tools/tool-registry.js";
import { PostgresPolicyEvaluationContextLoader } from "../catalog/postgres-store-general-runtime.js";
import { financeToolDefinitions, createFinanceTools } from "./finance-tools.js";
import { PostgresFinanceRepository } from "./postgres-finance-repository.js";

export const createFinanceRuntime = (pool: Pool) => {
  const repository = new PostgresFinanceRepository(pool);
  const registry = new ToolRegistry(financeToolDefinitions);
  return {
    financeService: repository,
    financeTools: createFinanceTools({
      repository,
      registry,
      authorizationService: new ToolAuthorizationService(registry),
      contextLoader: new PostgresPolicyEvaluationContextLoader(pool),
    }),
  };
};
