import { SwapWidget } from "@/components/swap/swap-widget";
import { getContractRegistryStatus } from "@/lib/contracts/registry";
import "./swap.css";

export default function SwapPage() {
  const registryStatus = getContractRegistryStatus();
  const writesDisabled = !registryStatus.verified || registryStatus.wrongNetwork;

  return (
    <>
      <div className="page-title">
        <h1>Swap</h1>
        <p>Request live testnet routes and review execution details before signing.</p>
      </div>
      {writesDisabled && (
        <div className="registry-banner" role="alert">
          <strong>Write actions are disabled.</strong>{" "}
          {registryStatus.wrongNetwork
            ? "The contract registry references contracts on the wrong network."
            : "The contract registry is unverified."}{" "}
          Swap and liquidity actions cannot be submitted until the registry is
          verified. See{" "}
          <a href="/docs/ARCHITECTURE.md">docs/ARCHITECTURE.md</a> for the review
          and rotation process.
        </div>
      )}
      <SwapWidget />
    </>
  );
}