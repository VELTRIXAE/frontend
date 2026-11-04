import { describe, expect, it } from "vitest";
import {
  analyticsSeriesSchema,
  assetIdentitySchema,
  errorEnvelopeSchema,
  indexedAnalyticsSchema,
  portfolioHistorySchema,
  quoteRequestSchema,
  quoteSchema,
} from "@/lib/api/schemas";

const route = {
  path: ["CA", "CB"],
  pools: ["CP"],
  protocol: "Soroswap" as const,
  amountIn: "10000000",
  amountOut: "20000000",
  fees: [{ token: "CA", amount: "30000", feeBps: 30 }],
  priceImpactBps: 10,
};

describe("backend API contracts", () => {
  it("accepts the published Soroswap quote contract", () => {
    const parsed = quoteSchema.parse({
      network: "testnet",
      kind: "exactIn",
      tokenIn: "CA",
      tokenOut: "CB",
      amountIn: "10000000",
      amountOut: "20000000",
      minimumReceived: "19900000",
      maximumInput: "10000000",
      slippageBps: 50,
      routes: [route],
      selectedRoute: route,
      ledger: 123,
      observedAt: 1_799_000_000_000,
      expiresAt: 1_799_000_030_000,
      executable: false,
      networkFee: null,
    });
    expect(parsed.selectedRoute.protocol).toBe("Soroswap");
  });

  it("rejects fractional base units and excessive slippage", () => {
    expect(() =>
      quoteRequestSchema.parse({ tokenIn: "CA", tokenOut: "CB", amount: "1.2", slippageBps: 501 }),
    ).toThrow();
  });

  it("requires request provenance in backend errors", () => {
    expect(() => errorEnvelopeSchema.parse({ error: { code: "BAD", message: "Bad request" } })).toThrow();
  });
});

describe("asset, pricing, and analytics contracts", () => {
  it("keeps duplicate asset codes distinguishable", () => {
    expect(
      assetIdentitySchema.parse({ code: "USDC", issuer: "G_ISSUER", contract: null }).issuer,
    ).toBe("G_ISSUER");
    expect(() => assetIdentitySchema.parse({ code: "USDC", issuer: null, contract: null })).toThrow();
  });

  it("preserves missing portfolio intervals instead of zero-filling", () => {
    const parsed = portfolioHistorySchema.parse({
      network: "testnet",
      source: {
        id: "source",
        name: "Source",
        url: "https://example.com",
        documentation: "https://example.com/docs",
      },
      from: 1,
      to: 3,
      intervalMs: 1,
      points: [{ timestamp: 1, totalUsd: null, pricedAssets: 0, unpricedAssets: 1 }],
      missingIntervals: [{ from: 2, to: 3 }],
    });
    expect(parsed.points[0].totalUsd).toBeNull();
    expect(parsed.missingIntervals).toHaveLength(1);
  });

  it("validates indexed analytics provenance", () => {
    const parsed = indexedAnalyticsSchema.parse({
      version: 1,
      network: "testnet",
      window: "24h",
      from: 1,
      to: 2,
      sourceLedger: 123,
      indexedAt: 2,
      state: "partial",
      gaps: [{ from: 1, to: 2, reason: "indexer lag" }],
      series: [{ metric: "volume", unit: "USD", points: [{ timestamp: 1, value: null }], available: false, unavailableReason: "gap" }],
    });
    expect(parsed.series[0].points[0].value).toBeNull();
  });

  it("validates frontend analytics without fabricating missing values", () => {
    const parsed = analyticsSeriesSchema.parse({
      metric: "volume",
      window: "7d",
      from: 1,
      to: 2,
      sourceLedger: 123,
      indexedAt: 2,
      partial: true,
      gaps: [{ from: 1, to: 2 }],
      points: [{ timestamp: 1, value: null }],
    });
    expect(parsed.points[0].value).toBeNull();
  });
});
