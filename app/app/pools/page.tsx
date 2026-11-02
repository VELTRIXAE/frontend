import Link from "next/link";
import { PoolsView } from "@/components/app/pools-view";

export default function PoolsPage() {
  return (
    <>
      <div className="page-title">
        <h1>Pools</h1>
        <p>
          Search verified Stellar liquidity pools and inspect on-chain reserves.
          Open a pool to view reserves, fees, contract address, and share
          information. Only registry-verified contracts can be used for
          add-liquidity and remove-liquidity actions.
        </p>
      </div>
      <PoolsView />
      <nav aria-label="Pool navigation" className="pool-nav">
        <Link href="/app/pools" className="pool-nav-link">
          All verified pools
        </Link>
      </nav>
    </>
  );
}