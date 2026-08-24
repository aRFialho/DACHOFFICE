import pg from "pg";
import type { Pool } from "pg";
import { createTrayRefreshTransport } from "./tray-refresh-transport.js";
import { startWorker } from "./worker.js";

type WorkerEnvironment = Record<string, string | undefined>;

const required = (environment: WorkerEnvironment, name: string): string => {
  const value = environment[name]?.trim();
  if (!value) throw new Error("worker_configuration_invalid");
  return value;
};

export const startConfiguredWorker = (
  input: {
    environment?: WorkerEnvironment;
    createPool?: (options: { connectionString: string }) => Pool;
    startWorker?: typeof startWorker;
    fetch?: typeof fetch;
  } = {},
) => {
  const environment = input.environment ?? process.env;
  const pool = (input.createPool ?? ((options) => new pg.Pool(options)))({
    connectionString: required(environment, "OFFICE_DATABASE_URL"),
  });
  const refreshTransport = createTrayRefreshTransport({
    clientId: required(environment, "TRAY_BOOTSTRAP_CLIENT_ID"),
    clientSecret: required(environment, "TRAY_BOOTSTRAP_CLIENT_SECRET"),
    fetch: input.fetch ?? globalThis.fetch,
  });
  const worker = (input.startWorker ?? startWorker)({
    pool,
    encryptionKeyBase64: required(environment, "TRAY_TOKEN_ENCRYPTION_KEY"),
    fetch: input.fetch ?? globalThis.fetch,
    refreshTransport,
  });
  return {
    async stop(): Promise<void> {
      worker.stop();
      await pool.end();
    },
  } satisfies { stop(): Promise<void> };
};
