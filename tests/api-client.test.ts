import { afterEach, describe, expect, it, vi } from "vitest";

const configMock = vi.hoisted(() => ({ config: { apiUrl: "https://api.example" as string | undefined } }));
vi.mock("@/lib/config", () => configMock);
import { api, ApiError } from "@/lib/api/client";

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

  it("propagates request identifiers on requests and errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ error: { code: "RATE_LIMITED", message: "Slow down", requestId: "req-123" } }, 429));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.tokens()).rejects.toMatchObject({ status: 429, code: "RATE_LIMITED", requestId: "req-123" });
    const headers = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(headers.get("x-request-id")).toBeTruthy();
    expect(headers.get("accept")).toBe("application/json");
  });

  it("parses error envelopes with requestId and details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: { code: "VALIDATION_ERROR", message: "Bad input", requestId: "req-9", details: { field: "amount" } } }, 400)));
    await expect(api.tokens()).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR", message: "Bad input", requestId: "req-9", details: { field: "amount" } });
  });

  it("throws an explicit ApiError when the API is unconfigured instead of fabricating data", async () => {
    const original = configMock.config.apiUrl;
    configMock.config.apiUrl = undefined;
    try {
      const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
      await expect(api.tokens()).rejects.toBeInstanceOf(ApiError);
      await expect(api.tokens()).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      configMock.config.apiUrl = original;
    }
  });

  it("builds transactions and validates the response", async () => {
    const built = { xdr: "AAAA", networkPassphrase: "Test SDF Network ; September 2015", simulation: { success: true, latestLedger: 1, minResourceFee: "100" } };
    const fetchMock = vi.fn().mockResolvedValue(json(built)); vi.stubGlobal("fetch", fetchMock);
    await expect(api.build({ quoteId: "q1" })).resolves.toEqual(built);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.example/api/v1/build");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST" });
  });

  it("rejects invalid build responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ xdr: 123 })));
    await expect(api.build({ quoteId: "q1" })).rejects.toMatchObject({ status: 502, code: "INVALID_RESPONSE" });
  });

  it("submits signed transactions and validates the response", async () => {
    const submitted = { hash: "abc", status: "PENDING", explorerUrl: "https://stellar.expert/explorer/testnet/tx/abc" };
    const fetchMock = vi.fn().mockResolvedValue(json(submitted)); vi.stubGlobal("fetch", fetchMock);
    await expect(api.submit({ xdr: "AAAA" })).resolves.toEqual(submitted);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.example/api/v1/submit");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST", body: JSON.stringify({ xdr: "AAAA" }) });
  });

  it("rejects invalid submit responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ hash: "abc" })));
    await expect(api.submit({ xdr: "AAAA" })).rejects.toMatchObject({ status: 502, code: "INVALID_RESPONSE" });
  });

  it("fetches portfolio and analytics with validation", async () => {
    const portfolio = { address: "GABC", network: "testnet", balances: [], totalValueUsd: null, observedAt: 1 };
    const analytics = { network: "testnet", tvlUsd: null, volume24hUsd: null, pools: [], observedAt: 1 };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(portfolio))
      .mockResolvedValueOnce(json(analytics));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.portfolio("GABC")).resolves.toEqual(portfolio);
    await expect(api.analytics()).resolves.toEqual(analytics);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.example/api/v1/portfolio/GABC");
    expect(String(fetchMock.mock.calls[1][0])).toBe("https://api.example/api/v1/analytics");
  });

  it("rejects invalid portfolio and analytics responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ address: "GABC" })));
    await expect(api.portfolio("GABC")).rejects.toMatchObject({ status: 502, code: "INVALID_RESPONSE" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ network: "testnet" })));
    await expect(api.analytics()).rejects.toMatchObject({ status: 502, code: "INVALID_RESPONSE" });
  });
});
