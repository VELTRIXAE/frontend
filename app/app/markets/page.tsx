import type { Metadata } from "next";
import { MarketsView } from "@/components/app/markets-view";

export const metadata: Metadata = {
  title: "Markets & Asset Explorer",
  description:
    "Search verified Stellar assets by code, issuer, or contract ID, and explore trading pairs, pools, liquidity, and issuer details.",
};

export default function MarketsPage() {
  return (
    <>
      <header className="page-title">
        <h1>Markets &amp; Asset Explorer</h1>
        <p>
          Search verified Stellar assets by code, issuer, or contract ID, and explore
          trading pairs, available pools, liquidity, and issuer details. Verification
          badges link to their provenance, and unsupported historical metrics are shown
          as unavailable.
        </p>
      </header>
      <main aria-label="Stellar market and asset explorer">
        <MarketsView />
      </main>
    </>
  );
}