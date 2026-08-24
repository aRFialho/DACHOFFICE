import { expect, it, vi } from "vitest";
import type { TrayRefreshTransport } from "../../../packages/catalog/src/tray-credential-provider.js";
import { createWorkerRuntime } from "../src/worker.js";
import { createConcreteCatalogSyncWorker } from "../src/catalog-sync-runtime.js";

it("composes the concrete catalog sync runner without provider work during construction", () => {
  const worker = createConcreteCatalogSyncWorker({
    pool: {} as never,
    encryptionKeyBase64: Buffer.alloc(32, 7).toString("base64"),
    fetch: async () => { throw new Error("must not fetch during construction"); },
    refreshTransport: { refresh: async () => { throw new Error("must not refresh during construction"); } },
  });
  expect(typeof worker.consumeOne).toBe("function");
});

it("starts bounded concrete catalog consumption with the injected server-side refresh transport", async () => {
  const refreshTransport: TrayRefreshTransport = {
    refresh: async () => ({ accessToken: "unused", accessTokenExpiresAt: new Date() }),
  };
  const catalogConsumeOne = vi.fn(async () => catalogConsumeOne.mock.calls.length === 1);
  const catalogWorkerFactory = vi.fn(() => ({ consumeOne: catalogConsumeOne }));
  const taskWorkerFactory = vi.fn(() => ({ consumeOne: async () => false }));
  const runtime = createWorkerRuntime({
    pool: {} as never,
    encryptionKeyBase64: Buffer.alloc(32, 7).toString("base64"),
    fetch: async () => { throw new Error("must not fetch in composition test"); },
    refreshTransport,
    catalogWorkerFactory: catalogWorkerFactory as never,
    taskWorkerFactory: taskWorkerFactory as never,
  });

  await expect(runtime.consumeAvailableWork(5)).resolves.toEqual({ taskJobs: 0, catalogSyncJobs: 1 });
  expect(catalogWorkerFactory).toHaveBeenCalledWith(expect.objectContaining({ refreshTransport }));
  expect(taskWorkerFactory).toHaveBeenCalledTimes(1);
});
