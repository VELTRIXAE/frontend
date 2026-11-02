import { describe, expect, it } from "vitest";
import {
  quoteRequestSchema,
  quoteSchema,
  priceQuoteSchema,
  priceResponseSchema,
  priceHistoryPointSchema,
  priceHistorySchema,
  portfolioValuationSchema,
  assetIdentitySchema,
} from "@/lib/api/schemas";

const route = { path: ["CA", "CB"], pools: ["CP"], protocol: "Soroswap" as const, amountIn: "10000000", amountOut: "20000000", fees: [{ token: "CA", amount: "30000", feeBps: 30 }], priceImpactBps: 10 };
const quote = { network: "testnet" as const, kind: "exactIn" as const, tokenIn: "CA", tokenOut: "CB", amountIn: "10000000", amountOut: "20000000", minimumReceived: "19900000", maximumInput: "10000000", slippageBps: 50, routes: [route], selectedRoute: route, ledger: 123, observedAt: 1_799_000_000_000, expiresAt: 1_799_000_030_000, executable: false, networkFee: null };

const asset = { code: "USDC", issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN", contract: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA" };
const price = { asset, price: "1.0001", source: "reflector" as const, observedAt: 1_799_000_000_000, ledger: 123, stale: false };
const priceResponse = { network: "testnet" as const, prices: [price], unavailable: [{ asset, reason: "no-source" as const }], fetchedAt: 1_799_000_000_000 };

describe("backend API contracts", () => {
  it("rejects fabricated or incomplete quotes", () => expect(() => quoteSchema.parse({ amountOut: "10" })).toThrow());
  it("validates slippage and integer base-unit amounts", () => expect(() => quoteRequestSchema.parse({ tokenIn: "CA", tokenOut: "CB", amount: "1.2", slippageBps: 501 })).toThrow());
  it("accepts the published quote contract", () => expect(quoteSchema.parse(quote).selectedRoute.protocol).toBe("Soroswap"));
});

describe("pricing schemas", () => {
  it("accepts a valid asset identity", () => {
    expect(assetIdentitySchema.parse(asset).code).toBe("USDC");
  });

  it("rejects asset identity missing issuer and contract", () => {
    expect(() => assetIdentitySchema.parse({ code: "USDC" })).toThrow();
  });

  it("accepts a valid price quote with source and freshness", () => {
    const parsed = priceQuoteSchema.parse(price);
    expect(parsed.source).toBe("reflector");
    expect(parsed.observedAt).toBe(1_799_000_000_000);
  });

  it("rejects a price quote missing source", () => {
    const { source: _source, ...withoutSource } = price;
    expect(() => priceQuoteSchema.parse(withoutSource)).toThrow();
  });

  it("rejects a price quote missing freshness timestamp", () => {
    const { observedAt: _observedAt, ...withoutObservedAt } = price;
    expect(() => priceQuoteSchema.parse(withoutObservedAt)).toThrow();
  });

  it("rejects a price quote with non-numeric price", () => {
    expect(() => priceQuoteSchema.parse({ ...price, price: "not-a-number" })).toThrow();
  });

  it("rejects a price quote with negative price", () => {
    expect(() => priceQuoteSchema.parse({ ...price, price: "-1" })).toThrow();
  });

  it("accepts a valid price response with unavailable entries", () => {
    const parsed = priceResponseSchema.parse(priceResponse);
    expect(parsed.prices).toHaveLength(1);
    expect(parsed.unavailable[0].reason).toBe("no-source");
  });

  it("rejects a price response missing fetchedAt", () => {
    const { fetchedAt: _fetchedAt, ...withoutFetchedAt } = priceResponse;
    expect(() => priceResponseSchema.parse(withoutFetchedAt)).toThrow();
  });

  it("rejects a price response with malformed price entries", () => {
    expect(() => priceResponseSchema.parse({ ...priceResponse, prices: [{ asset }] })).toThrow();
  });

  it("flags stale data via the stale field", () => {
    const parsed = priceQuoteSchema.parse({ ...price, stale: true });
    expect(parsed.stale).toBe(true);
  });
});

describe("price history schemas", () => {
  it("accepts a valid history point", () => {
    const point = { asset, price: "1.0001", source: "reflector" as const, observedAt: 1_799_000_000_000, ledger: 123 };
    expect(priceHistoryPointSchema.parse(point).price).toBe("1.0001");
  });

  it("rejects a history point missing source", () => {
    expect(() => priceHistoryPointSchema.parse({ asset, price: "1.0001", observedAt: 1_799_000_000_000, ledger: 123 })).toThrow();
  });

  it("accepts history with missing intervals represented as gaps", () => {
    const history = {
      network: "testnet" as const,
      asset,
      intervalMs: 60_000,
      points: [
        { asset, price: "1.0001", source: "reflector" as const, observedAt: 1_799_000_000_000, ledger: 123 },
        { asset, price: "1.0002", source: "reflector" as const, observedAt: 1_799_000_180_000, ledger: 125 },
      ],
      gaps: [{ start: 1_799_000_060_000, end: 1_799_000_120_000 }],
      fetchedAt: 1_799_000_200_000,
    };
    const parsed = priceHistorySchema.parse(history);
    expect(parsed.points).toHaveLength(2);
    expect(parsed.gaps).toHaveLength(1);
  });

  it("rejects history missing gaps field", () => {
    const history = {
      network: "testnet" as const,
      asset,
      intervalMs: 60_000,
      points: [],
      fetchedAt: 1_799_000_200_000,
    };
    expect(() => priceHistorySchema.parse(history)).toThrow();
  });

  it("rejects history with malformed gap intervals", () => {
    const history = {
      network: "testnet" as const,
      asset,
      intervalMs: 60_000,
      points: [],
      gaps: [{ start: "bad" }],
      fetchedAt: 1_799_000_200_000,
    };
    expect(() => priceHistorySchema.parse(history)).toThrow();
  });
});

describe("portfolio valuation schema", () => {
  const valuation = {
    network: "testnet" as const,
    totalValue: "1000.50",
    currency: "USD" as const,
    source: "reflector" as const,
    valuedAt: 1_799_000_000_000,
    stale: false,
    holdings: [
      { asset, amount: "500", value: "500.25", price: "1.0005", source: "reflector" as const, observedAt: 1_799_000_000_000 },
    ],
    unpriced: [{ asset, amount: "10", reason: "no-source" as const }],
  };

  it("accepts a valid valuation with priced and unpriced holdings", () => {
    const parsed = portfolioValuationSchema.parse(valuation);
    expect(parsed.totalValue).toBe("1000.50");
    expect(parsed.unpriced).toHaveLength(1);
  });

  it("rejects a valuation missing source", () => {
    const { source: _source, ...withoutSource } = valuation;
    expect(() => portfolioValuationSchema.parse(withoutSource)).toThrow();
  });

  it("rejects a valuation missing freshness timestamp", () => {
    const { valuedAt: _valuedAt, ...withoutValuedAt } = valuation;
    expect(() => portfolioValuationSchema.parse(withoutValuedAt)).toThrow();
  });

  it("rejects a valuation with fabricated holding prices", () => {
    const bad = {
      ...valuation,
      holdings: [{ asset, amount: "500", value: "500.25" }],
    };
    expect(() => portfolioValuationSchema.parse(bad)).toThrow();
  });

  it("rejects a valuation with unpriced entries missing reason", () => {
    const bad = {
      ...valuation,
      unpriced: [{ asset, amount: "10" }],
    };
    expect(() => portfolioValuationSchema.parse(bad)).toThrow();
  });
});