import {
  normalizeProviderProduct,
  normalizeProviderProductForPersistence,
  normalizeProviderVariations,
  normalizeProviderVariationsForPersistence,
  type NormalizedCatalogItem,
} from "./catalog-normalizer.js";
import type {
  CatalogProvider,
  MappingResolution,
  ProviderProduct,
} from "./contracts.js";
import type {
  CatalogRepository,
  CatalogRun,
} from "./postgres-catalog-repository.js";

export type SyncSummary = {
  runId: string;
  status: "completed" | "retryable" | "not_claimed";
  pagesSeen: number;
  itemsSeen: number;
  mappedCount: number;
  unresolvedCount: number;
};

export class CatalogSyncService {
  constructor(
    private readonly options: {
      provider: CatalogProvider;
      repository: CatalogRepository;
    },
  ) {}

  async run(runId: string): Promise<SyncSummary> {
    const run = await this.options.repository.claimRun(runId);
    if (!run) return summary(runId, "not_claimed", undefined);

    let state = run;
    try {
      for (;;) {
        const page = await this.options.provider.listProducts(
          state.checkpointCursor === undefined
            ? {}
            : { cursor: state.checkpointCursor },
        );
        const pageResult = await this.persistPage(state, page.products);
        state = pageResult.state;
        await this.options.repository.checkpointRun({
          runId,
          nextCursor: page.nextCursor,
          pagesSeen: state.pagesSeen,
          itemsSeen: state.itemsSeen,
          mappedCount: state.mappedCount,
          unresolvedCount: state.unresolvedCount,
        });
        state = { ...state, checkpointCursor: page.nextCursor };
        if (page.nextCursor === undefined) break;
      }
      await this.options.repository.completeRun(runId);
      return summary(runId, "completed", state);
    } catch {
      await this.options.repository.failRun({
        runId,
        failureCode: "catalog_provider_retryable",
      });
      return summary(runId, "retryable", state);
    }
  }

  private async persistPage(
    run: CatalogRun,
    products: ProviderProduct[],
  ): Promise<{ state: CatalogRun }> {
    let mapped = 0;
    let unresolved = 0;
    for (const product of products) {
      const results = await this.persistProductSafely(run, product);
      for (const result of results) {
        if (result.status === "mapped") mapped += 1;
        else unresolved += 1;
      }
    }
    return {
      state: {
        ...run,
        pagesSeen: run.pagesSeen + 1,
        itemsSeen: run.itemsSeen + products.length,
        mappedCount: run.mappedCount + mapped,
        unresolvedCount: run.unresolvedCount + unresolved,
      },
    };
  }

  private async persistProductSafely(
    run: CatalogRun,
    product: ProviderProduct,
  ): Promise<MappingResolution[]> {
    try {
      return await this.persistProduct(run, product, run.observedAt);
    } catch (error) {
      if (!(error instanceof CatalogNormalizationError)) throw error;
      if (
        typeof product.externalProductId !== "string" ||
        product.externalProductId.trim() === ""
      ) {
        return [{ status: "unresolved", reason: "mapping_not_found" }];
      }
      return [
        await this.options.repository.persistUnresolved({
          run,
          provider: run.provider,
          externalProductId: product.externalProductId,
          reason: "mapping_not_found",
        }),
      ];
    }
  }

  private async persistProduct(
    run: CatalogRun,
    product: ProviderProduct,
    observedAt: Date,
  ): Promise<MappingResolution[]> {
    let candidates: NormalizedCatalogItem[];
    try {
      candidates = [];
      const normalizedProduct = normalizeProviderProduct(product, observedAt);
      candidates.push(
        isNormalizedCatalogItem(normalizedProduct)
          ? normalizedProduct
          : normalizeProviderProductForPersistence(product, observedAt),
      );
      const normalizedVariations = normalizeProviderVariations(
        product,
        observedAt,
      );
      const persistedVariations = normalizeProviderVariationsForPersistence(
        product,
        observedAt,
      );
      for (const [index, variation] of normalizedVariations.entries()) {
        candidates.push(
          isNormalizedCatalogItem(variation)
            ? variation
            : persistedVariations[index]!,
        );
      }
    } catch {
      throw new CatalogNormalizationError();
    }
    return Promise.all(
      candidates.map((item) =>
        this.options.repository.persistItem({
          run,
          provider: run.provider,
          item,
        }),
      ),
    );
  }
}

class CatalogNormalizationError extends Error {
  constructor() {
    super("catalog_normalization_invalid");
  }
}

function isNormalizedCatalogItem(
  value: NormalizedCatalogItem | MappingResolution,
): value is NormalizedCatalogItem {
  return "externalProductId" in value;
}

function summary(
  runId: string,
  status: SyncSummary["status"],
  run: CatalogRun | undefined,
): SyncSummary {
  return {
    runId,
    status,
    pagesSeen: run?.pagesSeen ?? 0,
    itemsSeen: run?.itemsSeen ?? 0,
    mappedCount: run?.mappedCount ?? 0,
    unresolvedCount: run?.unresolvedCount ?? 0,
  };
}
