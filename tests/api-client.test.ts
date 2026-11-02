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

  it("searches assets with encoded query parameters", async () => {
    const asset = { contract: "C_ASSET", code: "USDC", issuer: "G_ISSUER", verification: "verified", provenance: "https://example/provenance" };
    const fetchMock = vi.fn().mockResolvedValue(json({ assets: [asset], total: 1 })); vi.stubGlobal("fetch", fetchMock);
    await expect(api.assetSearch({ q: "USDC G_ISSUER", limit: 10 })).resolves.toMatchObject({ assets: [asset] });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url.startsWith("https://api.example/api/v1/assets/search?")).toBe(true);
    expect(url).toContain("q=USDC+G_ISSUER");
    expect(url).toContain("limit=10");
  });

  it("fetches asset detail and rejects payloads missing provenance", async () => {
    const detail = { contract: "C_ASSET", code: "USDC", issuer: "G_ISSUER", verification: "verified", provenance: "https://example/provenance", pairs: [], pools: [] };
    const fetchMock = vi.fn().mockResolvedValue(json(detail)); vi.stubGlobal("fetch", fetchMock);
    await expect(api.asset("C_ASSET")).resolves.toMatchObject({ contract: "C_ASSET" });
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.example/api/v1/assets/C_ASSET");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ contract: "C_ASSET", code: "USDC", verification: "verified" })));
    await expect(api.asset("C_ASSET")).rejects.toMatchObject({ status: 502, code: "INVALID_RESPONSE" });
  });

  it("fetches pair and pool detail with liquidity", async () => {
    const pair = { id: "CA:CB", tokenA: "CA", tokenB: "CB", pools: [{ id: "CP", liquidity: "1000", protocol: "Soroswap" }] };
    const fetchMock = vi.fn().mockResolvedValue(json(pair)); vi.stubGlobal("fetch", fetchMock);
    await expect(api.pair("CA", "CB")).resolves.toMatchObject({ id: "CA:CB" });
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.example/api/v1/pairs/CA/CB");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ id: "CA:CB", tokenA: "CA" })));
    await expect(api.pair("CA", "CB")).rejects.toMatchObject({ status: 502, code: "INVALID_RESPONSE" });
  });

  it("fetches versioned analytics with freshness metadata", async () => {
    const analytics = { schemaVersion: 2, window: "24h", indexedAt: 10, sourceLedger: 5, series: [], gaps: [] };
    const fetchMock = vi.fn().mockResolvedValue(json(analytics)); vi.stubGlobal("fetch", fetchMock);
    await expect(api.analytics({ window: "24h" })).resolves.toMatchObject({ schemaVersion: 2 });
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.example/api/v1/analytics?window=24h");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ window: "24h", series: [] })));
    await expect(api.analytics({ window: "24h" })).rejects.toMatchObject({ status: 502, code: "INVALID_RESPONSE" });
  });

  it("propagates request identifiers on outgoing calls", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ tokens: [token] })); vi.stubGlobal("fetch", fetchMock);
    await api.tokens({ requestId: "req-123" });
    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get("x-request-id")).toBe("req-123");
  });
});
