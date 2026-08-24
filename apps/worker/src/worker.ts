import type { Pool } from "pg";
import type { TrayRefreshTransport } from "../../../packages/catalog/src/tray-credential-provider.js";
import {
  PostgresTaskJobRunner,
  PostgresTaskQueue,
} from "./postgres-task-worker.js";
import { TaskOutboxWorker } from "./task-worker.js";
import {
  PostgresCatalogSyncQueue,
  TrayCatalogOutboxWorker,
  type CatalogSyncRunner,
} from "./tray-catalog-worker.js";
import { createConcreteCatalogSyncWorker } from "./catalog-sync-runtime.js";

export const createTaskOutboxWorker = (pool: Pool): TaskOutboxWorker =>
  new TaskOutboxWorker(
    new PostgresTaskQueue(pool),
    new PostgresTaskJobRunner(pool),
  );

export const consumeAvailableTaskJobs = async (
  worker: TaskOutboxWorker,
  limit = 50,
): Promise<number> => {
  let completed = 0;
  for (let index = 0; index < limit; index += 1) {
    const delivered = await worker.consumeOne();
    if (!delivered) break;
    completed += 1;
  }
  return completed;
};

export const createTrayCatalogOutboxWorker = (
  pool: Pool,
  syncService: CatalogSyncRunner,
): TrayCatalogOutboxWorker =>
  new TrayCatalogOutboxWorker(new PostgresCatalogSyncQueue(pool), syncService);

export const consumeAvailableCatalogSyncJobs = async (
  worker: TrayCatalogOutboxWorker,
  limit = 50,
): Promise<number> => {
  let completed = 0;
  for (let index = 0; index < limit; index += 1) {
    const delivered = await worker.consumeOne();
    if (!delivered) break;
    completed += 1;
  }
  return completed;
};

type WorkerConsumer = { consumeOne(): Promise<boolean> };
type CatalogWorkerFactory = (input: {
  pool: Pool;
  encryptionKeyBase64: string;
  fetch: typeof fetch;
  refreshTransport: TrayRefreshTransport;
}) => TrayCatalogOutboxWorker;

export const createWorkerRuntime = (input: {
  pool: Pool;
  encryptionKeyBase64: string;
  fetch: typeof fetch;
  refreshTransport: TrayRefreshTransport;
  taskWorkerFactory?: (pool: Pool) => WorkerConsumer;
  catalogWorkerFactory?: CatalogWorkerFactory;
}) => {
  const taskWorker = (input.taskWorkerFactory ?? createTaskOutboxWorker)(input.pool);
  const catalogWorker = (input.catalogWorkerFactory ?? createConcreteCatalogSyncWorker)({
    pool: input.pool,
    encryptionKeyBase64: input.encryptionKeyBase64,
    fetch: input.fetch,
    refreshTransport: input.refreshTransport,
  });
  return {
    async consumeAvailableWork(limit = 50): Promise<{ taskJobs: number; catalogSyncJobs: number }> {
      const [taskJobs, catalogSyncJobs] = await Promise.all([
        consumeAvailableTaskJobs(taskWorker as TaskOutboxWorker, limit),
        consumeAvailableCatalogSyncJobs(catalogWorker, limit),
      ]);
      return { taskJobs, catalogSyncJobs };
    },
  };
};

export const startWorker = (input: Parameters<typeof createWorkerRuntime>[0] & {
  intervalMs?: number;
  onError?: () => void;
}) => {
  const runtime = createWorkerRuntime(input);
  const intervalMs = input.intervalMs ?? 1_000;
  if (!Number.isInteger(intervalMs) || intervalMs < 1_000) throw new Error("worker_interval_invalid");
  let consuming = false;
  const consume = async (): Promise<void> => {
    if (consuming) return;
    consuming = true;
    try { await runtime.consumeAvailableWork(); } catch { input.onError?.(); } finally { consuming = false; }
  };
  void consume();
  const timer = setInterval(() => { void consume(); }, intervalMs);
  return { stop: () => clearInterval(timer), consume };
};
