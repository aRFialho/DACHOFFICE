import { describe, expect, it } from "vitest";
import { CatalogSyncService } from "../src/catalog-sync-service.js";
import type {
  CatalogRepository,
  CatalogRun,
  PersistCatalogItemInput,
  PersistCatalogItemResult,
} from "../src/postgres-catalog-repository.js";
import type {
  CatalogPage,
  CatalogProvider,
  ProviderProduct,
} from "../src/contracts.js";

const mappedProduct: ProviderProduct = {
  externalProductId: "tray-product-17",
  reference: "SKU-017",
  ean: "7891234567890",
  price: "19.90",
  costPrice: "10.0000",
  promotionalPrice: "18.5000",
  stock: 8,
  status: "active",
  variations: [],
};

function createRun(
  checkpointCursor: string | undefined = undefined,
): CatalogRun {
  return {
    id: "run-1",
    officeId: "office-1",
    integrationId: "integration-1",
    provider: "tray",
    observedAt: new Date("2026-08-21T12:00:00.000Z"),
    checkpointCursor,
    pagesSeen: 0,
    itemsSeen: 0,
    mappedCount: 0,
    unresolvedCount: 0,
  };
}

class InMemoryCatalogRepository implements CatalogRepository {
  readonly localProducts: { sku: string; productId: string }[] = [];
  readonly mappings = new Map<
    string,
    | { status: "mapped"; productId: string }
    | {
        status: "unresolved";
        reason: "missing_sku" | "ambiguous_sku" | "mapping_not_found";
      }
  >();
  readonly listings = new Map<string, PersistCatalogItemInput>();
  readonly snapshots = new Set<string>();
  readonly checkpoints: (string | undefined)[] = [];
  readonly failureCodes: string[] = [];
  private readonly runs = new Map<string, CatalogRun>();

  constructor(run = createRun()) {
    this.runs.set(run.id, run);
  }

  async startRun(input: CatalogRun): Promise<void> {
    this.runs.set(input.id, input);
  }

  async claimRun(runId: string): Promise<CatalogRun | null> {
    return this.runs.get(runId) ?? null;
  }

  async checkpointRun(input: {
    runId: string;
    nextCursor: string | undefined;
    pagesSeen: number;
    itemsSeen: number;
    mappedCount: number;
    unresolvedCount: number;
  }): Promise<void> {
    const run = this.runs.get(input.runId);
    if (!run) throw new Error("missing run");
    this.runs.set(input.runId, {
      ...run,
      ...input,
      checkpointCursor: input.nextCursor,
    });
    this.checkpoints.push(input.nextCursor);
  }

  async persistItem(
    input: PersistCatalogItemInput,
  ): Promise<PersistCatalogItemResult> {
    const key = `${input.provider}:${input.item.externalProductId}:${input.item.externalVariationId ?? ""}`;
    let mapping = this.mappings.get(key);

    if (!mapping) {
      if (!input.item.externalSku) {
        mapping = { status: "unresolved", reason: "missing_sku" };
      } else {
        const matches = this.localProducts.filter(
          (product) => product.sku === input.item.externalSku,
        );
        mapping =
          matches.length === 1
            ? { status: "mapped", productId: matches[0]!.productId }
            : {
                status: "unresolved",
                reason:
                  matches.length === 0 ? "mapping_not_found" : "ambiguous_sku",
              };
      }
      this.mappings.set(key, mapping);
    }

    if (mapping.status === "unresolved") {
      return { status: "unresolved", reason: mapping.reason };
    }

    this.listings.set(key, input);
    this.snapshots.add(
      `${mapping.productId}:${input.item.costPrice}:${input.item.observedAt.toISOString()}:${key}`,
    );
    return { status: "mapped", productId: mapping.productId };
  }

  async completeRun(runId: string): Promise<void> {
    if (!this.runs.has(runId)) throw new Error("missing run");
  }

  async failRun(input: {
    runId: string;
    failureCode: "catalog_provider_retryable";
  }): Promise<void> {
    this.failureCodes.push(input.failureCode);
  }
}

function providerFromPages(
  pages: Record<string, CatalogPage>,
): CatalogProvider {
  return {
    async listProducts({ cursor }) {
      const page = pages[cursor ?? "first"];
      if (!page)
        throw new Error("provider fixture failure with access_token=secret");
      return page;
    },
    async getProduct() {
      throw new Error("not used");
    },
    async listVariations() {
      throw new Error("not used");
    },
  };
}

describe("CatalogSyncService", () => {
  it("persists an exact reference once as a mapped listing and numeric cost observation under replay", async () => {
    const repository = new InMemoryCatalogRepository();
    repository.localProducts.push({
      sku: "SKU-017",
      productId: "canonical-product-17",
    });
    const provider = providerFromPages({
      first: { products: [mappedProduct] },
    });
    const service = new CatalogSyncService({
      provider,
      repository,
    });

    await service.run("run-1");
    await service.run("run-1");

    expect(repository.listings).toHaveLength(1);
    expect(repository.snapshots).toHaveLength(1);
    expect([...repository.listings.values()][0]?.item.costPrice).toBe(
      "10.0000",
    );
  });

  it("persists an unresolved missing reference without a listing", async () => {
    const repository = new InMemoryCatalogRepository();
    const provider = providerFromPages({
      first: { products: [{ ...mappedProduct, reference: "" }] },
    });
    const service = new CatalogSyncService({ provider, repository });

    await service.run("run-1");

    expect([...repository.mappings.values()]).toEqual([
      { status: "unresolved", reason: "missing_sku" },
    ]);
    expect(repository.listings).toHaveLength(0);
    expect(repository.snapshots).toHaveLength(0);
  });

  it("persists an unresolved ambiguous exact SKU without a listing", async () => {
    const repository = new InMemoryCatalogRepository();
    repository.localProducts.push(
      { sku: "SKU-017", productId: "canonical-product-17a" },
      { sku: "SKU-017", productId: "canonical-product-17b" },
    );
    const provider = providerFromPages({
      first: { products: [mappedProduct] },
    });
    const service = new CatalogSyncService({ provider, repository });

    await service.run("run-1");

    expect([...repository.mappings.values()]).toEqual([
      { status: "unresolved", reason: "ambiguous_sku" },
    ]);
    expect(repository.listings).toHaveLength(0);
  });

  it("persists an unresolved variation reference without emitting variation facts", async () => {
    const repository = new InMemoryCatalogRepository();
    repository.localProducts.push({
      sku: "SKU-017",
      productId: "canonical-product-17",
    });
    const provider = providerFromPages({
      first: {
        products: [
          {
            ...mappedProduct,
            variations: [
              {
                externalVariationId: "tray-variation-17",
                reference: "",
                price: "19.90",
                costPrice: "10.0000",
                stock: 1,
                status: "active",
              },
            ],
          },
        ],
      },
    });
    const service = new CatalogSyncService({ provider, repository });

    await service.run("run-1");

    expect([...repository.mappings.values()]).toEqual([
      { status: "mapped", productId: "canonical-product-17" },
      { status: "unresolved", reason: "missing_sku" },
    ]);
    expect(repository.listings).toHaveLength(1);
  });
  it("resumes from its committed checkpoint on a later page", async () => {
    const repository = new InMemoryCatalogRepository(createRun("page-2"));
    repository.localProducts.push({
      sku: "SKU-017",
      productId: "canonical-product-17",
    });
    const requestedCursors: (string | undefined)[] = [];
    const provider: CatalogProvider = {
      async listProducts({ cursor }) {
        requestedCursors.push(cursor);
        return { products: [mappedProduct] };
      },
      async getProduct() {
        throw new Error("not used");
      },
      async listVariations() {
        throw new Error("not used");
      },
    };
    const service = new CatalogSyncService({ provider, repository });

    await service.run("run-1");

    expect(requestedCursors).toEqual(["page-2"]);
    expect(repository.checkpoints).toEqual([undefined]);
  });

  it("keeps a completed page and marks the run retryable with a safe failure code", async () => {
    const repository = new InMemoryCatalogRepository();
    repository.localProducts.push({
      sku: "SKU-017",
      productId: "canonical-product-17",
    });
    const provider = providerFromPages({
      first: { products: [mappedProduct], nextCursor: "second" },
    });
    const service = new CatalogSyncService({ provider, repository });

    await expect(service.run("run-1")).resolves.toMatchObject({
      status: "retryable",
    });

    expect(repository.checkpoints).toEqual(["second"]);
    expect(repository.listings).toHaveLength(1);
    expect(repository.failureCodes).toEqual(["catalog_provider_retryable"]);
  });
});
