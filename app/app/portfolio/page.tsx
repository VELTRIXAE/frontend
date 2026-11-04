import { PortfolioView } from "@/components/app/portfolio-view";

export const dynamic = "force-dynamic";

export default function PortfolioPage() {
  return (
    <>
      <div className="page-title">
        <h1>Portfolio</h1>
        <p>Verified wallet holdings, liquidity positions, and asset distribution.</p>
      </div>
      <PortfolioView />
    </>
  );
}
