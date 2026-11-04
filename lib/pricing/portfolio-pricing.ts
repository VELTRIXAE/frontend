import type { HorizonBalance } from "@/lib/stellar/horizon";

export const PRICE_SOURCE_NAME = "Stellar Horizon trade aggregations";

export type PortfolioAssetIdentity = { key: string; label: string };
export type PortfolioPrice = {
  key: string;
  available: boolean;
  usd: number;
  asOf: string;
};
export type PortfolioHistoryPoint = { timestamp: string; value: number | null };

export function assetIdentity(balance: HorizonBalance): PortfolioAssetIdentity {
  if (balance.asset_type === "native") return { key: "native:XLM", label: "XLM" };
  const code = balance.asset_code ?? "Unknown";
  const issuer = balance.asset_issuer ?? "unknown";
  return { key: `classic:${code}:${issuer}`, label: code };
}

export async function fetchPortfolioPrices(assets: PortfolioAssetIdentity[]) {
  return {
    prices: assets.map((asset) => ({ key: asset.key, available: false, usd: 0, asOf: new Date().toISOString() })),
    fetchedAt: new Date().toISOString(),
  };
}

export async function fetchPortfolioHistory(_assets: PortfolioAssetIdentity[]) {
  void _assets;
  return { points: [] as PortfolioHistoryPoint[], fetchedAt: new Date().toISOString() };
}
