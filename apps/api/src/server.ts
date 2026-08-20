import pg from 'pg';
import { buildServer } from './app.js';
import { PostgresAgentRepository } from './modules/admin/postgres-agent-repository.js';
import { createAgentService } from './modules/admin/agent-service.js';
import { PostgresOfficeRepository } from './modules/admin/postgres-office-repository.js';
import { createOfficeService } from './modules/admin/office-service.js';
import { PostgresAuthRepository } from './modules/auth/postgres-repository.js';
import { loadAuthRuntimeConfig } from './modules/auth/runtime-config.js';
import { createAuthService } from './modules/auth/service.js';

const runtimeConfig = loadAuthRuntimeConfig(process.env);
const pool = new pg.Pool({ connectionString: runtimeConfig.databaseUrl });
const authService = createAuthService({
  repository: new PostgresAuthRepository(pool),
  tokenConfig: runtimeConfig.tokenConfig,
});
const agentService = createAgentService(new PostgresAgentRepository(pool));
const officeService = createOfficeService(new PostgresOfficeRepository(pool));
const server = buildServer({
  authService,
  authTokenConfig: runtimeConfig.tokenConfig,
  agentService,
  officeService,
});

server.addHook('onClose', async () => {
  await pool.end();
});

const start = async (): Promise<void> => {
  await server.listen({ host: '0.0.0.0', port: Number(process.env.PORT ?? 3000) });
};

start().catch(async (error: unknown) => {
  await server.close();
  throw error;
});
