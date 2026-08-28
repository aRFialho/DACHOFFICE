import {
  assertDecimalString,
  parseProviderProduct,
  type CatalogPage,
  type CatalogProvider,
  type ProviderVariation,
  type ProviderProduct,
  type VariationPage,
} from "./contracts.js";
export interface TrayCredentialProvider {
  getAccessToken(
    connectionId: string,
  ): Promise<{ apiAddress: string; accessToken: string }>;
  refreshAccessToken(
    connectionId: string,
  ): Promise<{ apiAddress: string; accessToken: string }>;
}

const MAX_TRAY_REQUESTS_PER_MINUTE = 180;

export interface TrayRateBudget {
  readonly maxRequestsPerMinute: number;
  take(): Promise<void>;
}

export class TraySafeError extends Error {
  readonly retryable: boolean;

  constructor(
    readonly code:
      | "tray_auth_retryable"
      | "tray_rate_budget_invalid"
      | "tray_rate_limited"
      | "tray_response_invalid"
      | "tray_timeout"
      | "tray_upstream_unavailable",
    retryable = false,
  ) {
    super(code);
    this.name = "TraySafeError";
    this.retryable = retryable;
  }
}

export class TrayCatalogAdapter implements CatalogProvider {
  private requestTimestamps: number[] = [];
  private readonly effectiveRateLimit: number;
  private readonly takeAdditionalRateBudget: () => Promise<void>;

  constructor(
    private readonly options: {
      connectionId: string;
      credentials: TrayCredentialProvider;
      fetch: typeof fetch;
      timeoutMs: number;
      rateBudget: TrayRateBudget;
    },
  ) {
    const configuredRateLimit = options.rateBudget?.maxRequestsPerMinute;
    const take = options.rateBudget?.take;
    if (
      !Number.isInteger(configuredRateLimit) ||
      configuredRateLimit < 1 ||
      typeof take !== "function" ||
      !Number.isFinite(options.timeoutMs) ||
      options.timeoutMs <= 0
    ) {
      throw new TraySafeError("tray_rate_budget_invalid");
    }
    this.effectiveRateLimit = Math.min(
      configuredRateLimit,
      MAX_TRAY_REQUESTS_PER_MINUTE,
    );
    this.takeAdditionalRateBudget = take.bind(options.rateBudget);
  }

  async listProducts(input: { cursor?: string }): Promise<CatalogPage> {
    const payload = await this.read("products", input.cursor);
    try {
      const record = assertRecord(payload);
      return {
        products: assertArray(record.products).map(parseProviderProduct),
        ...nextCursor(record),
      };
    } catch {
      throw new TraySafeError("tray_response_invalid");
    }
  }

  async getProduct(input: {
    externalProductId: string;
  }): Promise<ProviderProduct> {
    const payload = await this.read(
      `products/${encodeURIComponent(input.externalProductId)}`,
    );
    try {
      const record = assertRecord(payload);
      return parseProviderProduct(record.product ?? payload);
    } catch {
      throw new TraySafeError("tray_response_invalid");
    }
  }

  async listVariations(input: { cursor?: string }): Promise<VariationPage> {
    const payload = await this.read("products/variants", input.cursor);
    try {
      const record = assertRecord(payload);
      return {
        variations: assertArray(record.variations).map((variation, index) =>
          parseVariation(variation, index),
        ),
        ...nextCursor(record),
      };
    } catch {
      throw new TraySafeError("tray_response_invalid");
    }
  }

  private async read(path: string, cursor?: string): Promise<unknown> {
    let credentials = await this.safeCredentials(false);
    let response = await this.fetchGet(credentials, path, cursor);
    if (response.status === 401) {
      credentials = await this.safeCredentials(true);
      response = await this.fetchGet(credentials, path, cursor);
      if (response.status === 401)
        throw new TraySafeError("tray_auth_retryable", true);
    }
    if (!response.ok)
      throw new TraySafeError(
        "tray_upstream_unavailable",
        response.status >= 500,
      );
    try {
      return await response.json();
    } catch {
      throw new TraySafeError("tray_response_invalid");
    }
  }

  private async safeCredentials(
    forceRefresh: boolean,
  ): Promise<{ apiAddress: string; accessToken: string }> {
    try {
      return forceRefresh
        ? await this.options.credentials.refreshAccessToken(
            this.options.connectionId,
          )
        : await this.options.credentials.getAccessToken(
            this.options.connectionId,
          );
    } catch {
      throw new TraySafeError("tray_auth_retryable", true);
    }
  }

  private reserveRequestSlot(): void {
    const now = Date.now();
    if (!Number.isFinite(now)) {
      throw new TraySafeError("tray_rate_budget_invalid");
    }
    const windowStart = now - 60_000;
    this.requestTimestamps = this.requestTimestamps.filter(
      (timestamp) => timestamp > windowStart,
    );
    if (this.requestTimestamps.length >= this.effectiveRateLimit) {
      throw new TraySafeError("tray_rate_limited", true);
    }
    this.requestTimestamps.push(now);
  }

  private async fetchGet(
    credentials: { apiAddress: string; accessToken: string },
    path: string,
    cursor?: string,
  ): Promise<Response> {
    this.reserveRequestSlot();
    try {
      await this.takeAdditionalRateBudget();
    } catch {
      throw new TraySafeError("tray_rate_limited", true);
    }
    const query = new URLSearchParams();
    if (cursor !== undefined) query.set("cursor", cursor);
    const suffix = query.size === 0 ? "" : `?${query.toString()}`;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.options.timeoutMs,
    );
    try {
      return await this.options.fetch(
        `${credentials.apiAddress.replace(/\/+$/, "")}/${path}${suffix}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${credentials.accessToken}` },
          signal: controller.signal,
        },
      );
    } catch {
      if (controller.signal.aborted)
        throw new TraySafeError("tray_timeout", true);
      throw new TraySafeError("tray_upstream_unavailable", true);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function parseVariation(value: unknown, index: number): ProviderVariation {
  const variation = assertRecord(value);
  const prefix = `variations[${index}]`;
  return {
    externalVariationId: nonBlankString(variation.id, `${prefix}.id`),
    reference: nonBlankString(variation.reference, `${prefix}.reference`),
    ...optionalString(variation.ean, `${prefix}.ean`),
    price: assertDecimalString(variation.price, `${prefix}.price`),
    costPrice: assertDecimalString(
      variation.cost_price,
      `${prefix}.cost_price`,
    ),
    ...optionalDecimalString(
      variation.promotional_price,
      `${prefix}.promotional_price`,
    ),
    stock: finiteNumber(variation.stock, `${prefix}.stock`),
    status: nonBlankString(variation.status, `${prefix}.status`),
  };
}

function assertRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("invalid response");
  return value as Record<string, unknown>;
}

function assertArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("invalid response");
  return value;
}

function nonBlankString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "")
    throw new Error(`${field} invalid`);
  return value;
}

function optionalString(value: unknown, field: string): { ean?: string } {
  return value === undefined || value === null
    ? {}
    : { ean: nonBlankString(value, field) };
}

function optionalDecimalString(
  value: unknown,
  field: string,
): { promotionalPrice?: string } {
  return value === undefined || value === null || value === ""
    ? {}
    : { promotionalPrice: assertDecimalString(value, field) };
}

function finiteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(`${field} invalid`);
  return value;
}

function nextCursor(record: Record<string, unknown>): { nextCursor?: string } {
  const paging = record.paging;
  if (
    paging === null ||
    typeof paging !== "object" ||
    Array.isArray(paging) ||
    !("next" in paging)
  )
    return {};
  const next = (paging as Record<string, unknown>).next;
  if (next === undefined || next === null) return {};
  if (typeof next !== "string" || next.trim() === "")
    throw new Error("invalid cursor");
  return { nextCursor: next };
}
