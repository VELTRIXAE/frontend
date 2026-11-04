import { describe, expect, it, vi } from "vitest";
import {
  NATIVE_ASSET,
  PRICE_SOURCE,
  assetKey,
  assetsEqual,
  computeValuationTotal,
  fetchCurrentPrices,
  fetchPortfolioHistory,
  isMissingInterval,
  isZeroValue,
  segmentPortfolioHistory,
  type AssetIdentity,
  type PortfolioPoint,
} from "@/lib/api/pricing";

const USDC: AssetIdentity = { code: "USDC", issuer: "G_ISSUER", contract: null };
const CONTRACT: AssetIdentity = { code: "TKN", issuer: null, contract: "C_TOKEN" };
const response = (records: unknown[], status = 200) =>
  new Response(JSON.stringify({ _embedded: { records } }), { status });
const record = (avg: string) => ({
  timestamp: 1_700_000_000_000,
  trade_count: 1,
  base_volume: "1",
  counter_volume: "1",
  avg,
  high: avg,
  low: avg,
  open: avg,
  close: avg,
});

describe("documented Stellar pricing", () => {
  it("uses issuer or contract identity without conflating duplicate codes", () => {
    expect(assetKey(NATIVE_ASSET)).toBe("native:XLM");
    expect(assetKey(USDC)).toContain("G_ISSUER");
    expect(assetKey(CONTRACT)).toBe("contract:C_TOKEN");
    expect(assetsEqual(USDC, { ...USDC })).toBe(true);
    expect(assetsEqual(USDC, CONTRACT)).toBe(false);
  });

  it("prices the quote asset as one without a network request", async () => {
    const fetchImpl = vi.fn();
    const prices = await fetchCurrentPrices({ horizonUrl: "https://horizon.example", fetchImpl }, { assets: [NATIVE_ASSET] });
    expect(prices[0]).toMatchObject({ status: "available", price: 1 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("validates source prices and preserves unavailable states", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response([record("1.25")]))
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response([record("invalid")]))
      .mockRejectedValueOnce(new Error("offline"));
    const config = { horizonUrl: "https://horizon.example/", fetchImpl };

    await expect(fetchCurrentPrices(config, { assets: [USDC] })).resolves.toMatchObject([{ status: "available", price: 1.25 }]);
    await expect(fetchCurrentPrices(config, { assets: [USDC] })).resolves.toMatchObject([{ status: "unavailable", reason: expect.stringContaining("No trade") }]);
    await expect(fetchCurrentPrices(config, { assets: [USDC] })).resolves.toMatchObject([{ status: "unavailable", reason: expect.stringContaining("non-numeric") }]);
    await expect(fetchCurrentPrices(config, { assets: [USDC] })).resolves.toMatchObject([{ status: "unavailable", reason: expect.stringContaining("offline") }]);
  });

  it("builds history with explicit gaps and rejects reversed windows", async () => {
    const startTime = new Date("2026-01-01T00:00:00.000Z");
    const endTime = new Date("2026-01-01T00:00:01.000Z");
    const history = await fetchPortfolioHistory(
      { horizonUrl: "https://horizon.example", fetchImpl: vi.fn() },
      { holdings: [{ asset: NATIVE_ASSET, quantity: 2 }], startTime, endTime, resolutionSeconds: 1 },
    );
    expect(history.points).toHaveLength(2);
    expect(history.points.every((point) => point.value === 2)).toBe(true);

    await expect(fetchPortfolioHistory(
      { horizonUrl: "https://horizon.example", fetchImpl: vi.fn() },
      { holdings: [], startTime: endTime, endTime: startTime },
    )).rejects.toThrow(/endTime/);
  });

  it("excludes missing prices from totals and distinguishes gaps from zero", () => {
    const fetchedAt = "2026-01-01T00:00:00.000Z";
    const prices = [
      { status: "available" as const, asset: NATIVE_ASSET, quoteAsset: NATIVE_ASSET, price: 1, source: PRICE_SOURCE.id, fetchedAt, sourceTimestamp: fetchedAt },
      { status: "unavailable" as const, asset: USDC, reason: "missing", source: PRICE_SOURCE.id, fetchedAt },
    ];
    const total = computeValuationTotal(prices, [
      { asset: NATIVE_ASSET, quantity: 3 },
      { asset: USDC, quantity: 2 },
      { asset: CONTRACT, quantity: 1 },
    ]);
    expect(total.total).toBe(3);
    expect(total.unpriced).toHaveLength(2);

    const base = { contributions: [], excludedAssets: [], source: PRICE_SOURCE.id, fetchedAt };
    const points: PortfolioPoint[] = [
      { ...base, timestamp: "2026-01-01T00:00:00.000Z", value: 0 },
      { ...base, timestamp: "2026-01-02T00:00:00.000Z", value: null },
      { ...base, timestamp: "2026-01-03T00:00:00.000Z", value: null },
    ];
    expect(isZeroValue(points[0])).toBe(true);
    expect(isMissingInterval(points[1])).toBe(true);
    expect(segmentPortfolioHistory({ points, source: PRICE_SOURCE.id, fetchedAt })).toMatchObject([
      { kind: "present", points: [points[0]] },
      { kind: "missing", points: [points[1], points[2]] },
    ]);
  });
});
