import { z } from "zod";

/**
 * Pricing module for Stellar-compatible assets.
 *
 * Documented price source:
 *   Stellar Horizon API (https://developers.stellar.org/api/introduction/)
 *   - Current prices are derived from the most recent trade aggregations
 *     exposed by Horizon (`/trade_aggregations`), which report the weighted
 *     average price over a time window for a given base/quote asset pair.
 *   - Historical portfolio points are only produced for intervals where the
 *     source returned trade aggregation data. Intervals without source data
 *     are reported as `missing` (never coerced to zero).
 *
 * Asset identity rules:
 *   - Native XLM: { code: "XLM", issuer: null, contract: null }
 *   - Classic assets: identified by `code` + `issuer` (issuer is required).
 *   - Soroban tokens: identified by `contract` (C... address). When a contract
 *     is present it takes precedence for identity, but code/issuer may still be
 *     carried for display purposes.
 *
 * Freshness:
 *   - Every price carries `fetchedAt` (ISO timestamp of when we retrieved it)
 *     and `sourceTimestamp` (ISO timestamp of the underlying source data point).
 *   - Consumers must surface both so valuations can be audited.
 *
 * Unavailable prices:
 *   - Assets with no source data are represented with `status: "unavailable"`
 *     and a `reason`. They are excluded from totals and must be labeled.
 */

// ---------------------------------------------------------------------------
// Asset identity
// ---------------------------------------------------------------------------

export const AssetIdentitySchema = z
  .object({
    code: z.string().min(1).max(12),
    issuer: z.string().min(1).nullable(),
    contract: z.string().min(1).nullable(),
  })
  .refine(
    (asset) => {
      // Native XLM: no issuer, no contract.
      if (asset.code === "XLM" && asset.issuer === null && asset.contract === null) {
        return true;
      }
      // Soroban token: contract address is sufficient identity.
      if (asset.contract !== null) {
        return true;
      }
      // Classic asset: issuer is required.
      return asset.issuer !== null;
    },
    {
      message:
        "Asset identity requires a contract address, or an issuer for classic assets, or be native XLM.",
    },
  );

export type AssetIdentity = z.infer<typeof AssetIdentitySchema>;

export const NATIVE_ASSET: AssetIdentity = {
  code: "XLM",
  issuer: null,
  contract: null,
};

/**
 * Stable string key for an asset identity. Used for map lookups and dedupe.
 */
export function assetKey(asset: AssetIdentity): string {
  if (asset.contract) {
    return `contract:${asset.contract}`;
  }
  if (asset.code === "XLM" && asset.issuer === null) {
    return "native:XLM";
  }
  return `classic:${asset.code}:${asset.issuer ?? ""}`;
}

export function assetsEqual(a: AssetIdentity, b: AssetIdentity): boolean {
  return assetKey(a) === assetKey(b);
}

// ---------------------------------------------------------------------------
// Source descriptor
// ---------------------------------------------------------------------------

export const PRICE_SOURCE = {
  id: "stellar-horizon-trade-aggregations",
  name: "Stellar Horizon — Trade Aggregations",
  documentation: "https://developers.stellar.org/api/introduction/",
  description:
    "Weighted average prices derived from Horizon trade aggregation endpoints. " +
    "Only intervals with source data are reported; missing intervals are never " +
    "coerced to zero.",
} as const;

export type PriceSourceId = typeof PRICE_SOURCE.id;

// ---------------------------------------------------------------------------
// Runtime-validated pricing response schemas
// ---------------------------------------------------------------------------

/**
 * A single trade aggregation record as returned by Horizon.
 * See: https://developers.stellar.org/api/resources/trade-aggregations/
 */
export const HorizonTradeAggregationSchema = z.object({
  timestamp: z.union([z.string(), z.number()]),
  trade_count: z.union([z.string(), z.number()]),
  base_volume: z.string(),
  counter_volume: z.string(),
  avg: z.string(),
  high: z.string(),
  low: z.string(),
  open: z.string(),
  close: z.string(),
});

export type HorizonTradeAggregation = z.infer<typeof HorizonTradeAggregationSchema>;

export const HorizonTradeAggregationsResponseSchema = z.object({
  _embedded: z
    .object({
      records: z.array(HorizonTradeAggregationSchema),
    })
    .optional(),
  _links: z.record(z.string(), z.unknown()).optional(),
});

export type HorizonTradeAggregationsResponse = z.infer<
  typeof HorizonTradeAggregationsResponseSchema
>;

/**
 * Normalized price point produced by this module.
 */
export const PricePointSchema = z.object({
  asset: AssetIdentitySchema,
  /** Price of 1 unit of asset in the quote asset (default: XLM). */
  price: z.number().finite().nonnegative(),
  quoteAsset: AssetIdentitySchema,
  source: z.literal(PRICE_SOURCE.id),
  /** When this module fetched the price. */
  fetchedAt: z.string().datetime(),
  /** Timestamp of the underlying source data point. */
  sourceTimestamp: z.string().datetime(),
});

export type PricePoint = z.infer<typeof PricePointSchema>;

export const UnavailablePriceSchema = z.object({
  asset: AssetIdentitySchema,
  status: z.literal("unavailable"),
  reason: z.string().min(1),
  source: z.literal(PRICE_SOURCE.id),
  fetchedAt: z.string().datetime(),
});

export type UnavailablePrice = z.infer<typeof UnavailablePriceSchema>;

export const AssetPriceSchema = z.discriminatedUnion("status", [
  PricePointSchema.extend({ status: z.literal("available") }),
  UnavailablePriceSchema,
]);

export type AssetPrice = z.infer<typeof AssetPriceSchema>;

// ---------------------------------------------------------------------------
// Historical portfolio points
// ---------------------------------------------------------------------------

/**
 * A single historical portfolio point. `value` is `null` when the source had
 * no data for the interval — this distinguishes a missing interval from a
 * genuine zero value.
 */
export const PortfolioPointSchema = z.object({
  /** ISO timestamp marking the start of the interval. */
  timestamp: z.string().datetime(),
  /** Total portfolio value, or `null` if the interval is missing. */
  value: z.number().finite().nonnegative().nullable(),
  /** Per-asset contributions included in `value`. */
  contributions: z.array(
    z.object({
      asset: AssetIdentitySchema,
      quantity: z.number().finite().nonnegative(),
      price: z.number().finite().nonnegative(),
      value: z.number().finite().nonnegative(),
    }),
  ),
  /** Assets excluded from this point because they were unpriced. */
  excludedAssets: z.array(AssetIdentitySchema),
  source: z.literal(PRICE_SOURCE.id),
  fetchedAt: z.string().datetime(),
});

export type PortfolioPoint = z.infer<typeof PortfolioPointSchema>;

export const PortfolioHistorySchema = z.object({
  points: z.array(PortfolioPointSchema),
  source: z.literal(PRICE_SOURCE.id),
  fetchedAt: z.string().datetime(),
});

export type PortfolioHistory = z.infer<typeof PortfolioHistorySchema>;

// ---------------------------------------------------------------------------
// Fetch configuration
// ---------------------------------------------------------------------------

export interface PricingClientConfig {
  /** Base URL of the Horizon instance, e.g. https://horizon.stellar.org */
  horizonUrl: string;
  /** Optional fetch implementation (defaults to global fetch). */
  fetchImpl?: typeof fetch;
  /** Request timeout in milliseconds. Defaults to 10_000. */
  timeoutMs?: number;
}

export interface FetchCurrentPricesOptions {
  assets: AssetIdentity[];
  /** Quote asset for pricing. Defaults to native XLM. */
  quoteAsset?: AssetIdentity;
  /** Aggregation resolution in seconds. Defaults to 3600 (1h). */
  resolutionSeconds?: number;
  /** Lookback window in seconds. Defaults to 86_400 (24h). */
  lookbackSeconds?: number;
}

export interface FetchPortfolioHistoryOptions {
  /** Holdings at each interval. */
  holdings: Array<{ asset: AssetIdentity; quantity: number }>;
  /** Start of the history window (inclusive). */
  startTime: Date;
  /** End of the history window (inclusive). */
  endTime: Date;
  /** Aggregation resolution in seconds. Defaults to 86_400 (1d). */
  resolutionSeconds?: number;
  /** Quote asset for pricing. Defaults to native XLM. */
  quoteAsset?: AssetIdentity;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toIso(timestamp: string | number): string {
  if (typeof timestamp === "number") {
    // Horizon returns milliseconds for trade aggregations.
    return new Date(timestamp).toISOString();
  }
  const numeric = Number(timestamp);
  if (!Number.isNaN(numeric) && /^\d+$/.test(timestamp)) {
    return new Date(numeric).toISOString();
  }
  return new Date(timestamp).toISOString();
}

function buildTradeAggregationsUrl(
  config: PricingClientConfig,
  base: AssetIdentity,
  counter: AssetIdentity,
  startTime: Date,
  endTime: Date,
  resolutionSeconds: number,
): string {
  const baseUrl = config.horizonUrl.replace(/\/+$/, "");
  const params = new URLSearchParams({
    base_asset_type: base.contract ? "contract" : base.issuer ? "credit_alphanum4" : "native",
    counter_asset_type: counter.contract
      ? "contract"
      : counter.issuer
        ? "credit_alphanum4"
        : "native",
    start_time: String(startTime.getTime()),
    end_time: String(endTime.getTime()),
    resolution: String(resolutionSeconds),
    order: "asc",
    limit: "200",
  });

  if (base.contract) {
    params.set("base_asset_contract", base.contract);
  } else if (base.issuer) {
    params.set("base_asset_code", base.code);
    params.set("base_asset_issuer", base.issuer);
  }

  if (counter.contract) {
    params.set("counter_asset_contract", counter.contract);
  } else if (counter.issuer) {
    params.set("counter_asset_code", counter.code);
    params.set("counter_asset_issuer", counter.issuer);
  }

  return `${baseUrl}/trade_aggregations?${params.toString()}`;
}

async function fetchJson(
  config: PricingClientConfig,
  url: string,
): Promise<unknown> {
  const fetchImpl = config.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 10_000);
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Horizon request failed: ${response.status} ${response.statusText}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchAggregations(
  config: PricingClientConfig,
  base: AssetIdentity,
  counter: AssetIdentity,
  startTime: Date,
  endTime: Date,
  resolutionSeconds: number,
): Promise<HorizonTradeAggregation[]> {
  const url = buildTradeAggregationsUrl(
    config,
    base,
    counter,
    startTime,
    endTime,
    resolutionSeconds,
  );
  const raw = await fetchJson(config, url);
  const parsed = HorizonTradeAggregationsResponseSchema.parse(raw);
  return parsed._embedded?.records ?? [];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch current prices for a set of assets. Assets without source data are
 * returned with `status: "unavailable"` rather than fabricated prices.
 */
export async function fetchCurrentPrices(
  config: PricingClientConfig,
  options: FetchCurrentPricesOptions,
): Promise<AssetPrice[]> {
  const quoteAsset = options.quoteAsset ?? NATIVE_ASSET;
  const resolutionSeconds = options.resolutionSeconds ?? 3600;
  const lookbackSeconds = options.lookbackSeconds ?? 86_400;
  const now = new Date();
  const startTime = new Date(now.getTime() - lookbackSeconds * 1000);
  const fetchedAt = now.toISOString();

  const results: AssetPrice[] = [];

  for (const asset of options.assets) {
    // Validate identity up front so callers get clear errors.
    AssetIdentitySchema.parse(asset);

    if (assetsEqual(asset, quoteAsset)) {
      results.push({
        status: "available",
        asset,
        quoteAsset,
        price: 1,
        source: PRICE_SOURCE.id,
        fetchedAt,
        sourceTimestamp: fetchedAt,
      });
      continue;
    }

    try {
      const records = await fetchAggregations(
        config,
        asset,
        quoteAsset,
        startTime,
        now,
        resolutionSeconds,
      );

      if (records.length === 0) {
        results.push({
          status: "unavailable",
          asset,
          reason: "No trade aggregation data available for the requested window.",
          source: PRICE_SOURCE.id,
          fetchedAt,
        });
        continue;
      }

      const latest = records[records.length - 1];
      const price = Number(latest.avg);
      if (!Number.isFinite(price) || price < 0) {
        results.push({
          status: "unavailable",
          asset,
          reason: "Source returned a non-numeric or negative average price.",
          source: PRICE_SOURCE.id,
          fetchedAt,
        });
        continue;
      }

      results.push({
        status: "available",
        asset,
        quoteAsset,
        price,
        source: PRICE_SOURCE.id,
        fetchedAt,
        sourceTimestamp: toIso(latest.timestamp),
      });
    } catch (error) {
      results.push({
        status: "unavailable",
        asset,
        reason:
          error instanceof Error
            ? `Failed to fetch price: ${error.message}`
            : "Failed to fetch price from source.",
        source: PRICE_SOURCE.id,
        fetchedAt,
      });
    }
  }

  return results;
}

/**
 * Fetch historical portfolio points. Only intervals with source data are
 * populated; intervals without data are reported with `value: null` so charts
 * can distinguish missing intervals from genuine zero values.
 */
export async function fetchPortfolioHistory(
  config: PricingClientConfig,
  options: FetchPortfolioHistoryOptions,
): Promise<PortfolioHistory> {
  const quoteAsset = options.quoteAsset ?? NATIVE_ASSET;
  const resolutionSeconds = options.resolutionSeconds ?? 86_400;
  const fetchedAt = new Date().toISOString();

  const { startTime, endTime } = options;
  if (endTime.getTime() < startTime.getTime()) {
    throw new Error("endTime must be greater than or equal to startTime");
  }

  // Build the set of interval timestamps we will report on.
  const intervalMs = resolutionSeconds * 1000;
  const intervalStarts: number[] = [];
  for (
    let t = startTime.getTime();
    t <= endTime.getTime();
    t += intervalMs
  ) {
    intervalStarts.push(t);
  }

  // Fetch per-asset aggregation series once.
  const seriesByAsset = new Map<
    string,
    { asset: AssetIdentity; byInterval: Map<number, number> }
  >();

  for (const holding of options.holdings) {
    AssetIdentitySchema.parse(holding.asset);
    const key = assetKey(holding.asset);

    if (assetsEqual(holding.asset, quoteAsset)) {
      const byInterval = new Map<number, number>();
      for (const t of intervalStarts) {
        byInterval.set(t, 1);
      }
      seriesByAsset.set(key, { asset: holding.asset, byInterval });
      continue;
    }

    try {
      const records = await fetchAggregations(
        config,
        holding.asset,
        quoteAsset,
        startTime,
        endTime,
        resolutionSeconds,
      );
      const byInterval = new Map<number, number>();
      for (const record of records) {
        const ts = new Date(toIso(record.timestamp)).getTime();
        const price = Number(record.avg);
        if (Number.isFinite(price) && price >= 0) {
          byInterval.set(ts, price);
        }
      }
      seriesByAsset.set(key, { asset: holding.asset, byInterval });
    } catch {
      // Leave asset out of the series map; it will be excluded from points.
      seriesByAsset.set(key, { asset: holding.asset, byInterval: new Map() });
    }
  }

  const points: PortfolioPoint[] = [];

  for (const intervalStart of intervalStarts) {
    const contributions: PortfolioPoint["contributions"] = [];
    const excludedAssets: AssetIdentity[] = [];
    let total = 0;
    let hasAnyData = false;

    for (const holding of options.holdings) {
      const key = assetKey(holding.asset);
      const series = seriesByAsset.get(key);
      const price = series?.byInterval.get(intervalStart);

      if (price === undefined) {
        excludedAssets.push(holding.asset);
        continue;
      }

      hasAnyData = true;
      const value = holding.quantity * price;
      contributions.push({
        asset: holding.asset,
        quantity: holding.quantity,
        price,
        value,
      });
      total += value;
    }

    points.push({
      timestamp: new Date(intervalStart).toISOString(),
      value: hasAnyData ? total : null,
      contributions,
      excludedAssets,
      source: PRICE_SOURCE.id,
      fetchedAt,
    });
  }

  return {
    points,
    source: PRICE_SOURCE.id,
    fetchedAt,
  };
}

// ---------------------------------------------------------------------------
// Totals helpers
// ---------------------------------------------------------------------------

export interface ValuationTotal {
  /** Sum of priced assets only. */
  total: number;
  /** Assets that contributed to the total. */
  priced: Array<{ asset: AssetIdentity; value: number; price: PricePoint }>;
  /** Assets excluded from the total because they were unpriced. */
  unpriced: UnavailablePrice[];
  /** Quote asset used for the total. */
  quoteAsset: AssetIdentity;
  source: PriceSourceId;
  fetchedAt: string;
}

/**
 * Compute a portfolio total, excluding unpriced assets. Unpriced assets are
 * returned separately so callers can label them in the UI.
 */
export function computeValuationTotal(
  prices: AssetPrice[],
  holdings: Array<{ asset: AssetIdentity; quantity: number }>,
  quoteAsset: AssetIdentity = NATIVE_ASSET,
): ValuationTotal {
  const priceByKey = new Map<string, AssetPrice>();
  for (const price of prices) {
    priceByKey.set(assetKey(price.asset), price);
  }

  const priced: ValuationTotal["priced"] = [];
  const unpriced: UnavailablePrice[] = [];
  let total = 0;
  let fetchedAt = new Date(0).toISOString();

  for (const holding of holdings) {
    const price = priceByKey.get(assetKey(holding.asset));
    if (!price) {
      unpriced.push({
        status: "unavailable",
        asset: holding.asset,
        reason: "No price was provided for this asset.",
        source: PRICE_SOURCE.id,
        fetchedAt: new Date().toISOString(),
      });
      continue;
    }

    if (price.status === "unavailable") {
      unpriced.push(price);
      continue;
    }

    if (price.fetchedAt > fetchedAt) {
      fetchedAt = price.fetchedAt;
    }

    const value = holding.quantity * price.price;
    priced.push({ asset: holding.asset, value, price });
    total += value;
  }

  return {
    total,
    priced,
    unpriced,
    quoteAsset,
    source: PRICE_SOURCE.id,
    fetchedAt,
  };
}

/**
 * Returns true when a portfolio point represents a missing interval (as
 * opposed to a genuine zero value).
 */
export function isMissingInterval(point: PortfolioPoint): boolean {
  return point.value === null;
}

/**
 * Returns true when a portfolio point represents a genuine zero value.
 */
export function isZeroValue(point: PortfolioPoint): boolean {
  return point.value === 0;
}

/**
 * Split a portfolio history into contiguous segments of present vs missing
 * intervals. Useful for rendering charts that must distinguish gaps from
 * zero values.
 */
export interface PortfolioSegment {
  kind: "present" | "missing";
  points: PortfolioPoint[];
}

export function segmentPortfolioHistory(
  history: PortfolioHistory,
): PortfolioSegment[] {
  const segments: PortfolioSegment[] = [];
  for (const point of history.points) {
    const kind: PortfolioSegment["kind"] = point.value === null ? "missing" : "present";
    const last = segments[segments.length - 1];
    if (last && last.kind === kind) {
      last.points.push(point);
    } else {
      segments.push({ kind, points: [point] });
    }
  }
  return segments;
}
