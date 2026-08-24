import { afterEach, expect, it, vi } from "vitest";
import type { TrayRefreshTransport } from "../../../packages/catalog/src/tray-credential-provider.js";
import { createWorkerRuntime, startWorker } from "../src/worker.js";
import { createConcreteCatalogSyncWorker } from "../src/catalog-sync-runtime.js";
import { createTrayRefreshTransport } from "../src/tray-refresh-transport.js";
import { startConfiguredWorker } from "../src/worker-entrypoint.js";

afterEach(() => {
  vi.useRealTimers();
});

it("composes the concrete catalog sync runner without provider work during construction", () => {
  const worker = createConcreteCatalogSyncWorker({
    pool: {} as never,
    encryptionKeyBase64: Buffer.alloc(32, 7).toString("base64"),
    fetch: async () => {
      throw new Error("must not fetch during construction");
    },
    refreshTransport: {
      refresh: async () => {
        throw new Error("must not refresh during construction");
      },
    },
  });
  expect(typeof worker.consumeOne).toBe("function");
});

it("starts bounded concrete catalog consumption with the injected server-side refresh transport", async () => {
  const refreshTransport: TrayRefreshTransport = {
    refresh: async () => ({
      accessToken: "unused",
      accessTokenExpiresAt: new Date(),
    }),
  };
  const catalogConsumeOne = vi.fn(
    async () => catalogConsumeOne.mock.calls.length === 1,
  );
  const catalogWorkerFactory = vi.fn(() => ({ consumeOne: catalogConsumeOne }));
  const taskWorkerFactory = vi.fn(() => ({ consumeOne: async () => false }));
  const runtime = createWorkerRuntime({
    pool: {} as never,
    encryptionKeyBase64: Buffer.alloc(32, 7).toString("base64"),
    fetch: async () => {
      throw new Error("must not fetch in composition test");
    },
    refreshTransport,
    catalogWorkerFactory: catalogWorkerFactory as never,
    taskWorkerFactory: taskWorkerFactory as never,
  });

  await expect(runtime.consumeAvailableWork(5)).resolves.toEqual({
    taskJobs: 0,
    catalogSyncJobs: 1,
  });
  expect(catalogWorkerFactory).toHaveBeenCalledWith(
    expect.objectContaining({ refreshTransport }),
  );
  expect(taskWorkerFactory).toHaveBeenCalledTimes(1);
});

it("uses a server-owned Tray refresh transport without exposing OAuth values", async () => {
  const seen: Array<{ url: string; init: RequestInit | undefined }> = [];
  const refresh = createTrayRefreshTransport({
    clientId: "server-client-id",
    clientSecret: "server-client-secret",
    fetch: async (url, init) => {
      seen.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          access_token: "fresh-access-token",
          refresh_token: "fresh-refresh-token",
          expires_in: 3600,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
    now: () => new Date("2026-08-24T00:00:00.000Z"),
  });

  await expect(
    refresh.refresh({
      apiAddress: "https://store.example",
      refreshToken: "stored-refresh-token",
    }),
  ).resolves.toEqual({
    accessToken: "fresh-access-token",
    refreshToken: "fresh-refresh-token",
    accessTokenExpiresAt: new Date("2026-08-24T01:00:00.000Z"),
  });
  expect(seen).toHaveLength(1);
  expect(seen[0]?.url).toBe("https://api.tray.com.br/auth");
  expect(seen[0]?.init?.method).toBe("POST");
  expect(
    JSON.stringify(
      await refresh.refresh({
        apiAddress: "https://store.example",
        refreshToken: "stored-refresh-token",
      }),
    ),
  ).not.toContain("server-client-secret");
});

it("aborts a hung Tray refresh and lets the worker settle before its next poll", async () => {
  vi.useFakeTimers();
  let refreshFailure: unknown;
  let seenSignal: AbortSignal | undefined;
  let catalogAttempts = 0;
  const refreshToken = "stored-refresh-token";
  const clientSecret = "server-client-secret";
  const refresh = createTrayRefreshTransport({
    clientId: "server-client-id",
    clientSecret,
    timeoutMs: 100,
    fetch: async (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        seenSignal = init?.signal ?? undefined;
        seenSignal?.addEventListener(
          "abort",
          () => reject(new Error("transport aborted")),
          { once: true },
        );
      }),
  });
  const worker = startWorker({
    pool: {} as never,
    encryptionKeyBase64: Buffer.alloc(32, 8).toString("base64"),
    fetch: async () => {
      throw new Error("catalog fetch must not run in this test");
    },
    refreshTransport: refresh,
    intervalMs: 1_000,
    taskWorkerFactory: () => ({ consumeOne: async () => false }),
    catalogWorkerFactory: () =>
      ({
        consumeOne: async () => {
          catalogAttempts += 1;
          if (catalogAttempts === 1) {
            try {
              await refresh.refresh({
                apiAddress: "https://store.example",
                refreshToken,
              });
            } catch (error) {
              refreshFailure = error;
            }
          }
          return false;
        },
      }) as never,
  });

  await vi.advanceTimersByTimeAsync(100);
  expect(seenSignal?.aborted).toBe(true);
  expect(refreshFailure).toEqual(new Error("tray_refresh_failed"));
  expect(String(refreshFailure)).not.toContain(refreshToken);
  expect(String(refreshFailure)).not.toContain(clientSecret);

  await vi.advanceTimersByTimeAsync(1_000);
  expect(catalogAttempts).toBe(2);
  worker.stop();
});
it("starts the real worker runtime with only server environment configuration", () => {
  const start = vi.fn(() => ({
    stop: vi.fn(),
    consume: async () => undefined,
  }));
  const pool = { end: vi.fn(async () => undefined) };
  const runtime = startConfiguredWorker({
    environment: {
      OFFICE_DATABASE_URL: "postgres://server-owned",
      TRAY_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 4).toString("base64"),
      TRAY_BOOTSTRAP_CLIENT_ID: "server-client-id",
      TRAY_BOOTSTRAP_CLIENT_SECRET: "server-client-secret",
    },
    createPool: () => pool as never,
    startWorker: start as never,
    fetch: async () => {
      throw new Error("must not fetch during startup");
    },
  });

  expect(start).toHaveBeenCalledWith(
    expect.objectContaining({
      pool,
      encryptionKeyBase64: Buffer.alloc(32, 4).toString("base64"),
      refreshTransport: expect.objectContaining({
        refresh: expect.any(Function),
      }),
    }),
  );
  expect(typeof runtime.stop).toBe("function");
});
