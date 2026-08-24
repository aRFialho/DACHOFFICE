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

const successResponse = (apiAddress = environment.TRAY_BOOTSTRAP_API_ADDRESS) =>
  new Response(
    JSON.stringify({
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_in: 3600,
      api_address: apiAddress,
    }),
    { status: 200 },
  );

const repositoryWith = (
  persist: (input: unknown) => Promise<{ outcome: "created" | "unchanged" }>,
) => ({
  bootstrap: async (_target: unknown, exchange: () => Promise<unknown>) =>
    persist(await exchange()),
});

it.each([
  undefined,
  "https://attacker.example/web_api",
  "https://store.example.tray.com.br/not-web-api",
  "https://store.example.tray.com.br/web_api?redirect=https://attacker.example",
])(
  "rejects a missing or hostile expected API address before transport",
  async (apiAddress) => {
    const fetch = vi.fn(async () => successResponse());
    const bootstrap = new TrayConnectionBootstrap({
      environment: { ...environment, TRAY_BOOTSTRAP_API_ADDRESS: apiAddress },
      fetch,
      repository: repositoryWith(async () => ({ outcome: "created" as const })),
    });

    await expect(bootstrap.run()).rejects.toEqual(
      new TrayBootstrapError("tray_bootstrap_configuration_invalid"),
    );
    expect(fetch).not.toHaveBeenCalled();
  },
);

it("rejects a mismatched provider API address before persistence", async () => {
  const persist = vi.fn(async () => ({ outcome: "created" as const }));
  const bootstrap = new TrayConnectionBootstrap({
    environment,
    fetch: async () =>
      successResponse("https://another-store.tray.com.br/web_api"),
    repository: repositoryWith(persist),
  });

  await expect(bootstrap.run()).rejects.toEqual(
    new TrayBootstrapError("tray_bootstrap_response_invalid"),
  );
  expect(persist).not.toHaveBeenCalled();
});

it("rejects null JSON response bodies as invalid provider responses", async () => {
  const persist = vi.fn(async () => ({ outcome: "created" as const }));
  const bootstrap = new TrayConnectionBootstrap({
    environment,
    fetch: async () => new Response("null", { status: 200 }),
    repository: repositoryWith(persist),
  });

  await expect(bootstrap.run()).rejects.toEqual(
    new TrayBootstrapError("tray_bootstrap_response_invalid"),
  );
  expect(persist).not.toHaveBeenCalled();
});

it.each([[], "not an object"])(
  "rejects array and primitive JSON response bodies as invalid provider responses",
  async (body) => {
    const persist = vi.fn(async () => ({ outcome: "created" as const }));
    const bootstrap = new TrayConnectionBootstrap({
      environment,
      fetch: async () => new Response(JSON.stringify(body), { status: 200 }),
      repository: repositoryWith(persist),
    });

    await expect(bootstrap.run()).rejects.toEqual(
      new TrayBootstrapError("tray_bootstrap_response_invalid"),
    );
    expect(persist).not.toHaveBeenCalled();
  },
);

it("acquires the repository target boundary before transport and serializes concurrent runs", async () => {
  let connectionExists = false;
  let lock = Promise.resolve();
  const repository = {
    bootstrap: async (
      _target: { officeId: string; integrationId: string },
      exchange: () => Promise<unknown>,
    ) => {
      const previousLock = lock;
      let releaseCurrent!: () => void;
      lock = new Promise<void>((resolve) => {
        releaseCurrent = resolve;
      });
      await previousLock;
      try {
        if (connectionExists) return { outcome: "unchanged" as const };
        await exchange();
        connectionExists = true;
        return { outcome: "created" as const };
      } finally {
        releaseCurrent();
      }
    },
  };
  const fetch = vi.fn(async () => successResponse());
  const bootstrap = new TrayConnectionBootstrap({
    environment,
    fetch,
    repository,
  });

  await expect(
    Promise.all([bootstrap.run(), bootstrap.run()]),
  ).resolves.toEqual([{ outcome: "created" }, { outcome: "unchanged" }]);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("does not exchange when the repository rejects the selected bootstrap target", async () => {
  const fetch = vi.fn(async () => successResponse());
  const bootstrap = new TrayConnectionBootstrap({
    environment,
    fetch,
    repository: {
      bootstrap: async () => {
        throw new TrayBootstrapError("tray_bootstrap_connection_unavailable");
      },
    },
  });

  await expect(bootstrap.run()).rejects.toEqual(
    new TrayBootstrapError("tray_bootstrap_connection_unavailable"),
  );
  expect(fetch).not.toHaveBeenCalled();
});
