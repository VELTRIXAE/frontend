"use client";
import { Check, Copy, LogOut, Wallet } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { shortenAddress } from "@/lib/stellar/wallet";
import { useWallet } from "./wallet-provider";
export function WalletButton() {
  const wallet = useWallet(); const [copied, setCopied] = useState(false);
  if (wallet.status !== "connected" || !wallet.address) return <Button onClick={wallet.connect} disabled={wallet.status === "connecting"}><Wallet size={17}/>{wallet.status === "connecting" ? "Connecting…" : "Connect wallet"}</Button>;
  const copy = async () => { await navigator.clipboard.writeText(wallet.address!); setCopied(true); setTimeout(() => setCopied(false), 1400); };
  return <div className="wallet-control"><span className={wallet.correctNetwork ? "network-ok" : "network-warn"}>{wallet.correctNetwork ? "Testnet" : "Wrong network"}</span><button onClick={copy} aria-label="Copy wallet address">{copied ? <Check size={15}/> : <Copy size={15}/>} {shortenAddress(wallet.address)}</button><button onClick={wallet.disconnect} aria-label="Disconnect wallet"><LogOut size={16}/></button></div>;
}
