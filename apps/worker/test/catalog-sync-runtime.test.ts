import { expect, it } from "vitest";
import { createConcreteCatalogSyncWorker } from "../src/catalog-sync-runtime.js";

it("composes the concrete catalog sync runner without provider work during construction", () => {
  const worker = createConcreteCatalogSyncWorker({
    pool: {} as never,
    encryptionKeyBase64: Buffer.alloc(32, 7).toString("base64"),
    fetch: async () => { throw new Error("must not fetch during construction"); },
  });
  expect(typeof worker.consumeOne).toBe("function");
});
