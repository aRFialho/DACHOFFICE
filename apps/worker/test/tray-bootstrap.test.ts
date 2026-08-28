import { expect, it, vi } from "vitest";
import {
  TrayBootstrapError,
  TrayConnectionBootstrap,
} from "../src/tray-bootstrap.js";

const testKey = Buffer.alloc(32, 5).toString("base64");

const environment = {
  TRAY_BOOTSTRAP_ENABLED: "true",
  TRAY_BOOTSTRAP_CLIENT_ID: "client-id",
  TRAY_BOOTSTRAP_CLIENT_SECRET: "client-secret",
  TRAY_BOOTSTRAP_AUTHORIZATION_CODE: "authorization-code",
  TRAY_BOOTSTRAP_OFFICE_ID: "11111111-1111-4111-8111-111111111111",
  TRAY_BOOTSTRAP_INTEGRATION_ID: "22222222-2222-4222-8222-222222222222",
  TRAY_BOOTSTRAP_API_ADDRESS: "https://store.example.tray.com.br/web_api",
  TRAY_TOKEN_ENCRYPTION_KEY: testKey,
};

const successResponse = () =>
  new Response(
    JSON.stringify({
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_in: 3600,
      api_address: "https://store.example.tray.com.br/web_api",
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

const repositoryWith = (
  persist: (input: unknown) => Promise<{ outcome: "created" | "unchanged" }>,
) => ({
  bootstrap: async (_target: unknown, exchange: () => Promise<unknown>) =>
    persist(await exchange()),
});

it("exchanges a controlled authorization code then persists encrypted material atomically", async () => {
  const persist = vi.fn(async () => ({ outcome: "created" as const }));
  const fetch = vi.fn(async () => successResponse());
  const bootstrap = new TrayConnectionBootstrap({
    environment,
    fetch,
    repository: repositoryWith(persist),
    now: () => new Date("2026-08-24T00:00:00.000Z"),
  });

  await expect(bootstrap.run()).resolves.toEqual({ outcome: "created" });
  expect(fetch).toHaveBeenCalledWith(
    "https://api.tray.com.br/auth",
    expect.objectContaining({ method: "POST" }),
  );
  expect(persist).toHaveBeenCalledWith(
    expect.objectContaining({
      apiAddress: "https://store.example.tray.com.br/web_api",
      accessTokenExpiresAt: new Date("2026-08-24T01:00:00.000Z"),
    }),
  );
  expect(JSON.stringify(persist.mock.calls)).not.toContain("access-token");
  expect(JSON.stringify(persist.mock.calls)).not.toContain("refresh-token");
});

it("is idempotent when the connection has already been bootstrapped", async () => {
  const persist = vi.fn(async () => ({ outcome: "unchanged" as const }));
  const bootstrap = new TrayConnectionBootstrap({
    environment,
    fetch: async () => successResponse(),
    repository: repositoryWith(persist),
  });

  await expect(bootstrap.run()).resolves.toEqual({ outcome: "unchanged" });
  expect(persist).toHaveBeenCalledTimes(1);
});

it("skips the one-time code exchange when a connection exists", async () => {
  const fetch = vi.fn(async () => successResponse());
  const persist = vi.fn(async () => ({ outcome: "created" as const }));
  const bootstrap = new TrayConnectionBootstrap({
    environment,
    fetch,
    repository: { bootstrap: async () => ({ outcome: "unchanged" as const }) },
  });

  await expect(bootstrap.run()).resolves.toEqual({ outcome: "unchanged" });
  expect(fetch).not.toHaveBeenCalled();
  expect(persist).not.toHaveBeenCalled();
});

it("rejects malformed provider responses without persistence or secret leakage", async () => {
  const persist = vi.fn();
  const bootstrap = new TrayConnectionBootstrap({
    environment,
    fetch: async () =>
      new Response(
        JSON.stringify({
          access_token: "access-token",
          refresh_token: "refresh-token",
          expires_in: "3600",
          api_address: "not-a-url",
        }),
        { status: 200 },
      ),
    repository: repositoryWith(persist),
  });

  await expect(bootstrap.run()).rejects.toEqual(
    new TrayBootstrapError("tray_bootstrap_response_invalid"),
  );
  expect(persist).not.toHaveBeenCalled();
  await bootstrap.run().catch((error: unknown) => {
    expect(String(error)).not.toContain("access-token");
    expect(String(error)).not.toContain("refresh-token");
    expect(String(error)).not.toContain("not-a-url");
  });
});

it("bounds a hung exchange and returns a redacted timeout code", async () => {
  vi.useFakeTimers();
  const secret = "client-secret";
  const code = "authorization-code";
  const bootstrap = new TrayConnectionBootstrap({
    environment: { ...environment, TRAY_BOOTSTRAP_CLIENT_SECRET: secret },
    fetch: async (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        (init?.signal as AbortSignal).addEventListener(
          "abort",
          () => reject(new Error("transport aborted")),
          { once: true },
        );
      }),
    repository: repositoryWith(async () => ({ outcome: "created" as const })),
    timeoutMs: 100,
  });

  const result = bootstrap.run();
  const assertion = expect(result).rejects.toEqual(
    new TrayBootstrapError("tray_bootstrap_timeout"),
  );
  await vi.advanceTimersByTimeAsync(100);
  await assertion;
  await result.catch((error: unknown) => {
    expect(String(error)).not.toContain(secret);
    expect(String(error)).not.toContain(code);
  });
  vi.useRealTimers();
});

it("requires an explicit server-side bootstrap invocation", async () => {
  const bootstrap = new TrayConnectionBootstrap({
    environment: { ...environment, TRAY_BOOTSTRAP_ENABLED: "false" },
    fetch: async () => successResponse(),
    repository: repositoryWith(async () => ({ outcome: "created" as const })),
  });

  await expect(bootstrap.run()).rejects.toEqual(
    new TrayBootstrapError("tray_bootstrap_not_enabled"),
  );
});

it("requires an explicit office and integration selection", async () => {
  const bootstrap = new TrayConnectionBootstrap({
    environment: { ...environment, TRAY_BOOTSTRAP_OFFICE_ID: undefined },
    fetch: async () => successResponse(),
    repository: repositoryWith(async () => ({ outcome: "created" as const })),
  });

  await expect(bootstrap.run()).rejects.toEqual(
    new TrayBootstrapError("tray_bootstrap_configuration_invalid"),
  );
});
