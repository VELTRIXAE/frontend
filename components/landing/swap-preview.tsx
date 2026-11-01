"use client";
import { ArrowDown, Settings2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

export function SwapPreview() {
  const [amount, setAmount] = useState("");
  const validAmount = useMemo(() => Number.isFinite(Number(amount)) && Number(amount) > 0, [amount]);
  return <div className="swap-preview glass" aria-label="Interactive swap preview"><div className="swap-title"><div><span className="status-dot"/>Stellar Testnet</div><Settings2 size={18}/></div><div className="token-input"><span>You pay</span><div><input inputMode="decimal" aria-label="Amount to pay" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}/><button>XLM <span>⌄</span></button></div><small>Balance available after wallet connection</small></div><div className="swap-arrow"><ArrowDown size={18}/></div><div className="token-input"><span>You receive</span><div><input aria-label="Estimated amount received" placeholder="0.00" readOnly/><button>USDC <span>⌄</span></button></div><small>{validAmount ? "Connect to request a live quote" : "Enter an amount for a live quote"}</small></div><Button className="swap-action" onClick={() => location.assign("/app/swap")}>{validAmount ? "Connect wallet to quote" : "Launch swap"}</Button><p className="preview-note">Preview only · Live routes are requested in the app</p></div>;
}
