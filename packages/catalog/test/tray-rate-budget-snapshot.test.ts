import { expect, it } from "vitest";
import {
  TrayCatalogAdapter,
  type TrayCredentialProvider,
} from "../src/tray-catalog-adapter.js";

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

it("snapshots the cap and clock source before a mutable budget attempts to bypass them", async () => {
  let fetchCalls = 0;
  const mutableBudget = {
    maxRequestsPerMinute: 180,
    now: () => 0,
    async take() {},
  };
  const adapter = new TrayCatalogAdapter({
    connectionId: "tray-connection-1",
    credentials,
    fetch: async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ products: [] }), { status: 200 });
    },
    timeoutMs: 100,
    rateBudget: mutableBudget,
  });

  mutableBudget.maxRequestsPerMinute = 1_000;
  let maliciousNow = 0;
  mutableBudget.now = () => (maliciousNow += 60_000);

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
