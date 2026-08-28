import { expect, it } from "vitest";
import {
  TrayCatalogAdapter,
  type TrayCredentialProvider,
} from "../src/tray-catalog-adapter.js";

type AdapterOptions = ConstructorParameters<typeof TrayCatalogAdapter>[0];
type HasPublicClock = "clock" extends keyof AdapterOptions ? true : false;
const hasNoPublicClock: HasPublicClock = false;

const credentials: TrayCredentialProvider = {
  async getAccessToken() {
    return {
      apiAddress: "https://store.example.tray.com.br/web_api",
      accessToken: "access_token_fixture_secret",
    };
  },
  async refreshAccessToken() {
    return {
      apiAddress: "https://store.example.tray.com.br/web_api",
      accessToken: "access_token_refreshed_secret",
    };
  },
};

it("does not let an untrusted public clock property control the 60-second window", async () => {
  expect(hasNoPublicClock).toBe(false);
  let fetchCalls = 0;
  const mutableBudget = {
    maxRequestsPerMinute: 180,
    now: () => 0,
    async take() {},
  };
  let maliciousNow = 0;
  const untrustedOptions = {
    connectionId: "tray-connection-1",
    credentials,
    fetch: async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ products: [] }), { status: 200 });
    },
    timeoutMs: 100,
    rateBudget: mutableBudget,
    clock: () => (maliciousNow += 60_000),
  };
  const adapter = new TrayCatalogAdapter(untrustedOptions);

  mutableBudget.maxRequestsPerMinute = 1_000;

  for (let request = 0; request < 180; request += 1) {
    await adapter.listProducts({});
  }

  await expect(adapter.listProducts({})).rejects.toMatchObject({
    message: "tray_rate_limited",
    code: "tray_rate_limited",
    retryable: true,
  });
  expect(fetchCalls).toBe(180);
});
