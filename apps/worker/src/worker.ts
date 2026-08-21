import type { Pool } from "pg";
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
