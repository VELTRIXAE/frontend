"use client";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { connectFreighter, type WalletSnapshot } from "@/lib/stellar/wallet";

type WalletContextValue = WalletSnapshot & { connect: () => Promise<void>; disconnect: () => void };
const initial: WalletSnapshot = { status: "disconnected", address: null, network: null, correctNetwork: false };
const WalletContext = createContext<WalletContextValue | null>(null);
export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [wallet, setWallet] = useState(initial);
  const connect = useCallback(async () => { setWallet({ ...initial, status: "connecting" }); setWallet(await connectFreighter()); }, []);
  const disconnect = useCallback(() => setWallet(initial), []);
  const value = useMemo(() => ({ ...wallet, connect, disconnect }), [wallet, connect, disconnect]);
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
export function useWallet() { const value = useContext(WalletContext); if (!value) throw new Error("useWallet must be used inside WalletProvider"); return value; }
