import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config", () => ({ config: { apiUrl: "https://api.example" } }));
import { api } from "@/lib/api/client";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const token = { contract: "C_TOKEN", symbol: "TKN", name: "Token", decimals: 7, verification: "onchain-metadata-only" };

describe("VELTRIXAE API client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the published API prefix and validates token responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ tokens: [token] })); vi.stubGlobal("fetch", fetchMock);
    await expect(api.tokens()).resolves.toEqual({ tokens: [token] });
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.example/api/v1/tokens");
  });

  it("posts integer quote requests without retrying", async () => {
    const route = { path: ["CA", "CB"], pools: ["CP"], protocol: "Soroswap", amountIn: "1", amountOut: "2", fees: [], priceImpactBps: 0 };
    const response = { network: "testnet", kind: "exactIn", tokenIn: "CA", tokenOut: "CB", amountIn: "1", amountOut: "2", minimumReceived: "1", maximumInput: "1", slippageBps: 50, routes: [route], selectedRoute: route, ledger: 1, observedAt: 1, expiresAt: 2, executable: false, networkFee: null };
    const fetchMock = vi.fn().mockResolvedValue(json(response)); vi.stubGlobal("fetch", fetchMock);
    await api.quote({ tokenIn: "CA", tokenOut: "CB", amount: "1" });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST", body: JSON.stringify({ tokenIn: "CA", tokenOut: "CB", amount: "1", kind: "exactIn", slippageBps: 50, maxHops: 3 }) });
  });

  it("preserves backend error codes and messages", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: { code: "NOT_CONFIGURED", message: "Deployment missing" } }, 503)));
    await expect(api.quote({ tokenIn: "CA", tokenOut: "CB", amount: "1" })).rejects.toMatchObject({ status: 503, code: "NOT_CONFIGURED", message: "Deployment missing" });
  });

  it("rejects invalid successful payloads", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ tokens: [{ symbol: "missing contract" }] })));
    await expect(api.tokens()).rejects.toMatchObject({ status: 502, code: "INVALID_RESPONSE" });
  });

  it("validates pricing responses and propagates source and freshness", async () => {
    const price = { asset: { code: "XLM", issuer: null, contract: "C_XLM" }, priceUsd: "0.1234", source: "coingecko", observedAt: 1_700_000_000, stale: false, available: true };
    const fetchMock = vi.fn().mockResolvedValue(json({ prices: [price], source: "coingecko", fetchedAt: 1_700_000_005 })); vi.stubGlobal("fetch", fetchMock);
    const result = await api.prices();
    expect(result).toEqual({ prices: [price], source: "coingecko", fetchedAt: 1_700_000_005 });
    expect(result.prices[0]).toMatchObject({ source: "coingecko", observedAt: 1_700_000_000, stale: false });
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.example/api/v1/prices");
  });

  it("preserves unavailable and stale price states", async () => {
    const prices = [
      { asset: { code: "TKN", issuer: "G_ISSUER", contract: "C_TOKEN" }, priceUsd: null, source: "coingecko", observedAt: null, stale: true, available: false },
      { asset: { code: "XLM", issuer: null, contract: "C_XLM" }, priceUsd: "0.1", source: "coingecko", observedAt: 1, stale: true, available: true },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ prices, source: "coingecko", fetchedAt: 2 })));
    const result = await api.prices();
    expect(result.prices[0]).toMatchObject({ priceUsd: null, available: false, stale: true });
    expect(result.prices[1]).toMatchObject({ priceUsd: "0.1", available: true, stale: true });
  });

  it("rejects invalid pricing payloads", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ prices: [{ asset: { code: "XLM" }, priceUsd: "0.1" }], source: "coingecko", fetchedAt: 1 })));
    await expect(api.prices()).rejects.toMatchObject({ status: 502, code: "INVALID_RESPONSE" });
  });

  it("validates valuation history and preserves missing intervals", async () => {
    const history = { points: [{ timestamp: 1, totalUsd: "100.5", pricedAssets: 2, unpricedAssets: ["C_TOKEN"] }, { timestamp: 2, totalUsd: null, pricedAssets: 0, unpricedAssets: ["C_TOKEN", "C_XLM"] }], source: "coingecko", fetchedAt: 3 };
    const fetchMock = vi.fn().mockResolvedValue(json(history)); vi.stubGlobal("fetch", fetchMock);
    const result = await api.valuationHistory();
    expect(result).toEqual(history);
    expect(result.points[1].totalUsd).toBeNull();
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.example/api/v1/valuation/history");
  });

  it("rejects invalid valuation history payloads", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ points: [{ timestamp: "bad", totalUsd: "1" }], source: "coingecko", fetchedAt: 1 })));
    await expect(api.valuationHistory()).rejects.toMatchObject({ status: 502, code: "INVALID_RESPONSE" });
  });
});
