import { describe, expect, it } from "vitest";
import { quoteRequestSchema, quoteSchema } from "@/lib/api/schemas";

const route = { path: ["CA", "CB"], pools: ["CP"], protocol: "Soroswap" as const, amountIn: "10000000", amountOut: "20000000", fees: [{ token: "CA", amount: "30000", feeBps: 30 }], priceImpactBps: 10 };
const quote = { network: "testnet" as const, kind: "exactIn" as const, tokenIn: "CA", tokenOut: "CB", amountIn: "10000000", amountOut: "20000000", minimumReceived: "19900000", maximumInput: "10000000", slippageBps: 50, routes: [route], selectedRoute: route, ledger: 123, observedAt: 1_799_000_000_000, expiresAt: 1_799_000_030_000, executable: false, networkFee: null };

describe("backend API contracts", () => {
  it("rejects fabricated or incomplete quotes", () => expect(() => quoteSchema.parse({ amountOut: "10" })).toThrow());
  it("validates slippage and integer base-unit amounts", () => expect(() => quoteRequestSchema.parse({ tokenIn: "CA", tokenOut: "CB", amount: "1.2", slippageBps: 501 })).toThrow());
  it("accepts the published quote contract", () => expect(quoteSchema.parse(quote).selectedRoute.protocol).toBe("Soroswap"));
});
