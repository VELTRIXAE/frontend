import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
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