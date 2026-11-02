"use client";
import { Check, Copy, LogOut, Wallet } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { shortenAddress } from "@/lib/stellar/wallet";
import { useWallet } from "./wallet-provider";

export function WalletButton() {
  const wallet = useWallet();
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  if (wallet.status !== "connected" || !wallet.address) {
    const connecting = wallet.status === "connecting";
    return (
      <div className="wallet-select" ref={menuRef}>
        <Button
          onClick={() => setMenuOpen((open) => !open)}
          disabled={connecting}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={connecting ? "Connecting to wallet" : "Connect a Stellar wallet"}
        >
          <Wallet size={17} />
          {connecting ? "Connecting…" : "Connect wallet"}
        </Button>
        {menuOpen && !connecting && (
          <div className="wallet-menu" role="menu" aria-label="Available Stellar wallets">
            {wallet.adapters.map((adapter) => {
              const available = adapter.isAvailable();
              return (
                <button
                  key={adapter.id}
                  type="button"
                  role="menuitem"
                  className="wallet-menu-item"
                  disabled={!available}
                  aria-disabled={!available}
                  aria-label={
                    available
                      ? `Connect with ${adapter.name}`
                      : `${adapter.name} is not available in this browser`
                  }
                  onClick={() => {
                    setMenuOpen(false);
                    void wallet.connect(adapter.id);
                  }}
                >
                  <span className="wallet-menu-name">{adapter.name}</span>
                  {!available && <span className="wallet-menu-status">Not installed</span>}
                </button>
              );
            })}
          </div>
        )}
        {wallet.error && (
          <p className="wallet-error" role="alert">
            {wallet.error}
          </p>
        )}
      </div>
    );
  }

  const copy = async () => {
    await navigator.clipboard.writeText(wallet.address!);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="wallet-control">
      <span className="wallet-name">{wallet.walletName}</span>
      <span className={wallet.correctNetwork ? "network-ok" : "network-warn"}>
        {wallet.correctNetwork ? "Testnet" : "Wrong network"}
      </span>
      <button onClick={copy} aria-label="Copy wallet address">
        {copied ? <Check size={15} /> : <Copy size={15} />} {shortenAddress(wallet.address)}
      </button>
      <button onClick={wallet.disconnect} aria-label="Disconnect wallet">
        <LogOut size={16} />
      </button>
      {wallet.error && (
        <p className="wallet-error" role="alert">
          {wallet.error}
        </p>
      )}
    </div>
  );
}