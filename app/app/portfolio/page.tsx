import { PortfolioView } from "@/components/app/portfolio-view";

export const dynamic = "force-dynamic";

const PRICING_SOURCE = {
  name: "Stellar DEX / Horizon Order Book",
  provider: "Stellar Development Foundation (Horizon API)",
  documentationUrl: "https://developers.stellar.org/docs/data/apis/horizon",
  description:
    "Asset valuations are derived from documented Stellar Horizon order book data. Assets without a verified, fresh price are excluded from totals and labeled as unpriced.",
};

export default function PortfolioPage() {
  return (
    <>
      <div className="page-title">
        <h1>Portfolio</h1>
        <p>Verified wallet holdings, liquidity positions, and asset distribution.</p>
      </div>
      <PortfolioView pricingSource={PRICING_SOURCE} />
    </>
  );
}