import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { quoteRequestSchema, quoteSchema } from "@/lib/api/schemas";
import {
  analyticsResponseSchema,
  analyticsWindowSchema,
  analyticsSeriesSchema,
  analyticsPointSchema,
  analyticsFreshnessSchema,
  analyticsGapSchema,
  analyticsMetricSchema,
  analyticsTokenPerformanceSchema,
  computeVolumeSeries,
  computeLiquiditySeries,
  computeTransactionSeries,
  computeTokenPerformanceSeries,
  buildAnalyticsResponse,
} from "@/lib/api/analytics";
import {
  quoteRequestSchema,
  quoteSchema,
  tokensResponseSchema,
  poolsResponseSchema,
  portfolioResponseSchema,
  analyticsResponseSchema,
  preparedSwapSchema,
  transactionStatusSchema,
  errorEnvelopeSchema,
} from "@/lib/api/schemas";

const route = { path: ["CA", "CB"], pools: ["CP"], protocol: "Soroswap" as const, amountIn: "10000000", amountOut: "20000000", fees: [{ token: "CA", amount: "30000", feeBps: 30 }], priceImpactBps: 10 };
const quote = { network: "testnet" as const, kind: "exactIn" as const, tokenIn: "CA", tokenOut: "CB", amountIn: "10000000", amountOut: "20000000", minimumReceived: "19900000", maximumInput: "10000000", slippageBps: 50, routes: [route], selectedRoute: route, ledger: 123, observedAt: 1_799_000_000_000, expiresAt: 1_799_000_030_000, executable: false, networkFee: null };

const fixturesDir = join(__dirname, "fixtures");
const loadFixture = (name: string): unknown => JSON.parse(readFileSync(join(fixturesDir, name), "utf8"));

describe("backend API contracts", () => {
  it("rejects fabricated or incomplete quotes", () => expect(() => quoteSchema.parse({ amountOut: "10" })).toThrow());
  it("validates slippage and integer base-unit amounts", () => expect(() => quoteRequestSchema.parse({ tokenIn: "CA", tokenOut: "CB", amount: "1.2", slippageBps: 501 })).toThrow());
  it("accepts the published quote contract", () => expect(quoteSchema.parse(quote).selectedRoute.protocol).toBe("Soroswap"));
});

// ---------------------------------------------------------------------------
// Analytics fixtures
// ---------------------------------------------------------------------------

const WINDOW = { startLedger: 100, endLedger: 200, startTime: 1_799_000_000_000, endTime: 1_799_000_100_000, bucket: "hour" as const };

const FRESHNESS = {
  indexedAt: 1_799_000_095_000,
  sourceLedger: 198,
  targetLedger: 200,
  complete: false,
  partial: true,
};

const GAP = { startLedger: 150, endLedger: 160, reason: "indexer_lag" as const };

const VOLUME_POINTS = [
  { bucketStart: 1_799_000_000_000, bucketEnd: 1_799_000_060_000, value: "1000", sourceLedger: 120, indexedAt: 1_799_000_061_000 },
  { bucketStart: 1_799_000_060_000, bucketEnd: 1_799_000_100_000, value: null, sourceLedger: 160, indexedAt: 1_799_000_101_000 },
];

const LIQUIDITY_POINTS = [
  { bucketStart: 1_799_000_000_000, bucketEnd: 1_799_000_060_000, value: "50000", sourceLedger: 120, indexedAt: 1_799_000_061_000 },
  { bucketStart: 1_799_000_060_000, bucketEnd: 1_799_000_100_000, value: "48000", sourceLedger: 160, indexedAt: 1_799_000_101_000 },
];

const TRANSACTION_POINTS = [
  { bucketStart: 1_799_000_000_000, bucketEnd: 1_799_000_060_000, value: 12, sourceLedger: 120, indexedAt: 1_799_000_061_000 },
  { bucketStart: 1_799_000_060_000, bucketEnd: 1_799_000_100_000, value: null, sourceLedger: 160, indexedAt: 1_799_000_101_000 },
];

const TOKEN_PERFORMANCE_POINTS = [
  { bucketStart: 1_799_000_000_000, bucketEnd: 1_799_000_060_000, value: "0.05", sourceLedger: 120, indexedAt: 1_799_000_061_000 },
  { bucketStart: 1_799_000_060_000, bucketEnd: 1_799_000_100_000, value: null, sourceLedger: 160, indexedAt: 1_799_000_101_000 },
];

const ANALYTICS_RESPONSE = {
  window: WINDOW,
  freshness: FRESHNESS,
  gaps: [GAP],
  series: {
    volume: { metric: "volume" as const, unit: "base" as const, points: VOLUME_POINTS },
    liquidity: { metric: "liquidity" as const, unit: "base" as const, points: LIQUIDITY_POINTS },
    transactions: { metric: "transactions" as const, unit: "count" as const, points: TRANSACTION_POINTS },
    tokenPerformance: { metric: "tokenPerformance" as const, unit: "ratio" as const, points: TOKEN_PERFORMANCE_POINTS },
  },
};

describe("analytics schema contracts", () => {
  it("validates aggregation windows", () => {
    expect(analyticsWindowSchema.parse(WINDOW).bucket).toBe("hour");
    expect(() => analyticsWindowSchema.parse({ ...WINDOW, endLedger: 99 })).toThrow();
    expect(() => analyticsWindowSchema.parse({ ...WINDOW, bucket: "minute" })).toThrow();
  });

  it("validates freshness timestamps and partial state", () => {
    const parsed = analyticsFreshnessSchema.parse(FRESHNESS);
    expect(parsed.indexedAt).toBe(1_799_000_095_000);
    expect(parsed.sourceLedger).toBe(198);
    expect(parsed.partial).toBe(true);
    expect(parsed.complete).toBe(false);
    expect(() => analyticsFreshnessSchema.parse({ ...FRESHNESS, indexedAt: -1 })).toThrow();
  });

  it("validates gap descriptors", () => {
    expect(analyticsGapSchema.parse(GAP).reason).toBe("indexer_lag");
    expect(() => analyticsGapSchema.parse({ ...GAP, endLedger: 140 })).toThrow();
  });

  it("parses each metric series with source ledger and indexed-at", () => {
    const volume = analyticsSeriesSchema.parse(ANALYTICS_RESPONSE.series.volume);
    expect(volume.metric).toBe("volume");
    expect(volume.points[0].sourceLedger).toBe(120);
    expect(volume.points[0].indexedAt).toBe(1_799_000_061_000);

    const liquidity = analyticsSeriesSchema.parse(ANALYTICS_RESPONSE.series.liquidity);
    expect(liquidity.metric).toBe("liquidity");

    const transactions = analyticsSeriesSchema.parse(ANALYTICS_RESPONSE.series.transactions);
    expect(transactions.metric).toBe("transactions");

    const tokenPerformance = analyticsSeriesSchema.parse(ANALYTICS_RESPONSE.series.tokenPerformance);
    expect(tokenPerformance.metric).toBe("tokenPerformance");
  });

  it("accepts the full analytics response", () => {
    const parsed = analyticsResponseSchema.parse(ANALYTICS_RESPONSE);
    expect(parsed.window.startLedger).toBe(100);
    expect(parsed.freshness.partial).toBe(true);
    expect(parsed.gaps).toHaveLength(1);
    expect(parsed.series.volume.points).toHaveLength(2);
  });

  it("rejects missing data coerced to zero", () => {
    // A null value must remain null, never become "0" or 0.
    expect(() => analyticsPointSchema.parse({ ...VOLUME_POINTS[1], value: "0" })).not.toThrow();
    const parsed = analyticsPointSchema.parse(VOLUME_POINTS[1]);
    expect(parsed.value).toBeNull();
    expect(parsed.value).not.toBe(0);
    expect(parsed.value).not.toBe("0");
  });

  it("rejects points missing source ledger or indexed-at", () => {
    expect(() => analyticsPointSchema.parse({ bucketStart: 1, bucketEnd: 2, value: "1" })).toThrow();
    expect(() => analyticsPointSchema.parse({ bucketStart: 1, bucketEnd: 2, value: "1", sourceLedger: 1 })).toThrow();
  });

  it("rejects invalid metric identifiers", () => {
    expect(() => analyticsMetricSchema.parse("fees")).toThrow();
    expect(analyticsMetricSchema.parse("volume")).toBe("volume");
  });
});

describe("analytics metric calculations", () => {
  const trades = [
    { ledger: 110, timestamp: 1_799_000_010_000, amountIn: "100", amountOut: "200", pool: "CP1", token: "CA" },
    { ledger: 120, timestamp: 1_799_000_020_000, amountIn: "300", amountOut: "600", pool: "CP1", token: "CA" },
    { ledger: 170, timestamp: 1_799_000_070_000, amountIn: "50", amountOut: "100", pool: "CP2", token: "CB" },
  ];

  const liquiditySnapshots = [
    { ledger: 110, timestamp: 1_799_000_010_000, pool: "CP1", reserve: "10000" },
    { ledger: 120, timestamp: 1_799_000_020_000, pool: "CP1", reserve: "12000" },
    { ledger: 170, timestamp: 1_799_000_070_000, pool: "CP2", reserve: "5000" },
  ];

  const transactions = [
    { ledger: 110, timestamp: 1_799_000_010_000, hash: "h1", success: true },
    { ledger: 120, timestamp: 1_799_000_020_000, hash: "h2", success: true },
    { ledger: 170, timestamp: 1_799_000_070_000, hash: "h3", success: false },
  ];

  const tokenPrices = [
    { ledger: 110, timestamp: 1_799_000_010_000, token: "CA", price: "1.00" },
    { ledger: 120, timestamp: 1_799_000_020_000, token: "CA", price: "1.10" },
    { ledger: 170, timestamp: 1_799_000_070_000, token: "CA", price: "1.05" },
  ];

  it("aggregates volume into buckets and preserves gaps as null", () => {
    const series = computeVolumeSeries(trades, WINDOW, [GAP]);
    expect(series.metric).toBe("volume");
    // Bucket 1 (ledgers 100-150): 100 + 300 = 400
    expect(series.points[0].value).toBe("400");
    // Bucket 2 (ledgers 150-200): trade at 170 => 50
    expect(series.points[1].value).toBe("50");
    // Every point carries provenance
    for (const point of series.points) {
      expect(point.sourceLedger).toBeGreaterThanOrEqual(WINDOW.startLedger);
      expect(point.indexedAt).toBeGreaterThan(0);
    }
  });

  it("marks buckets fully inside a gap as null, never zero", () => {
    const gap = { startLedger: 100, endLedger: 200, reason: "indexer_lag" as const };
    const series = computeVolumeSeries(trades, WINDOW, [gap]);
    for (const point of series.points) {
      expect(point.value).toBeNull();
      expect(point.value).not.toBe("0");
    }
  });

  it("computes liquidity series from latest snapshot per bucket", () => {
    const series = computeLiquiditySeries(liquiditySnapshots, WINDOW, []);
    expect(series.metric).toBe("liquidity");
    expect(series.points[0].value).toBe("12000");
    expect(series.points[1].value).toBe("5000");
  });

  it("returns null liquidity for buckets with no snapshot", () => {
    const series = computeLiquiditySeries(liquiditySnapshots, { ...WINDOW, endLedger: 300, endTime: 1_799_000_200_000 }, []);
    const empty = series.points[series.points.length - 1];
    expect(empty.value).toBeNull();
  });

  it("counts transactions per bucket and preserves gaps", () => {
    const series = computeTransactionSeries(transactions, WINDOW, []);
    expect(series.metric).toBe("transactions");
    expect(series.points[0].value).toBe(2);
    expect(series.points[1].value).toBe(1);
  });

  it("returns null transaction counts for gapped buckets", () => {
    const gap = { startLedger: 150, endLedger: 200, reason: "indexer_lag" as const };
    const series = computeTransactionSeries(transactions, WINDOW, [gap]);
    expect(series.points[1].value).toBeNull();
  });

  it("computes token performance as relative price change", () => {
    const series = computeTokenPerformanceSeries(tokenPrices, "CA", WINDOW, []);
    expect(series.metric).toBe("tokenPerformance");
    // First bucket: 1.00 -> 1.10 => +0.10
    expect(series.points[0].value).toBe("0.1");
    // Second bucket: 1.10 -> 1.05 => -0.05
    expect(series.points[1].value).toBe("-0.05");
  });

  it("returns null token performance when no prior price exists", () => {
    const series = computeTokenPerformanceSeries(tokenPrices, "CA", { ...WINDOW, startLedger: 200, endLedger: 300, startTime: 1_799_000_100_000, endTime: 1_799_000_200_000 }, []);
    for (const point of series.points) {
      expect(point.value).toBeNull();
    }
  });

  it("builds a full analytics response with freshness and gaps", () => {
    const response = buildAnalyticsResponse({
      window: WINDOW,
      freshness: FRESHNESS,
      gaps: [GAP],
      trades,
      liquiditySnapshots,
      transactions,
      tokenPrices,
      token: "CA",
    });
    const parsed = analyticsResponseSchema.parse(response);
    expect(parsed.freshness.partial).toBe(true);
    expect(parsed.gaps).toHaveLength(1);
    expect(parsed.series.volume.points[0].value).toBe("400");
    expect(parsed.series.transactions.points[0].value).toBe(2);
    expect(parsed.series.liquidity.points[0].value).toBe("12000");
    expect(parsed.series.tokenPerformance.points[0].value).toBe("0.1");
  });

  it("never coerces missing data to zero in the built response", () => {
    const response = buildAnalyticsResponse({
      window: WINDOW,
      freshness: FRESHNESS,
      gaps: [{ startLedger: 100, endLedger: 200, reason: "indexer_lag" }],
      trades: [],
      liquiditySnapshots: [],
      transactions: [],
      tokenPrices: [],
      token: "CA",
    });
    const parsed = analyticsResponseSchema.parse(response);
    for (const series of Object.values(parsed.series)) {
      for (const point of series.points) {
        expect(point.value).toBeNull();
        expect(point.value).not.toBe(0);
        expect(point.value).not.toBe("0");
      }
    }
describe("backend contract fixtures", () => {
  it("validates tokens fixture", () => {
    const parsed = tokensResponseSchema.parse(loadFixture("tokens.json"));
    expect(parsed.tokens.length).toBeGreaterThan(0);
  });

  it("validates pools fixture", () => {
    const parsed = poolsResponseSchema.parse(loadFixture("pools.json"));
    expect(parsed.pools.length).toBeGreaterThan(0);
  });

  it("validates portfolio fixture", () => {
    const parsed = portfolioResponseSchema.parse(loadFixture("portfolio.json"));
    expect(parsed.network).toBe("testnet");
  });

  it("validates analytics fixture", () => {
    const parsed = analyticsResponseSchema.parse(loadFixture("analytics.json"));
    expect(parsed.network).toBe("testnet");
  });

  it("validates quote fixture", () => {
    const parsed = quoteSchema.parse(loadFixture("quote.json"));
    expect(parsed.selectedRoute.protocol).toBe("Soroswap");
  });

  it("validates prepared-swap fixture", () => {
    const parsed = preparedSwapSchema.parse(loadFixture("prepared-swap.json"));
    expect(parsed.network).toBe("testnet");
  });

  it("validates transaction-status fixture", () => {
    const parsed = transactionStatusSchema.parse(loadFixture("transaction-status.json"));
    expect(parsed.network).toBe("testnet");
  });

  it("validates error-envelope fixture", () => {
    const parsed = errorEnvelopeSchema.parse(loadFixture("error-envelope.json"));
    expect(parsed.error.code).toBeTruthy();
  });

  it("rejects invalid tokens fixture", () => {
    expect(() => tokensResponseSchema.parse({ tokens: [{ address: "CA" }] })).toThrow();
  });

  it("rejects invalid quote fixture", () => {
    expect(() => quoteSchema.parse({ ...quote, amountOut: "1.5" })).toThrow();
  });

  it("rejects invalid error envelope fixture", () => {
    expect(() => errorEnvelopeSchema.parse({ error: {} })).toThrow();
  });
});