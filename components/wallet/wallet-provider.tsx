"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  getWalletAdapters,
  readWallet,
  connectWallet,
  disconnectWallet,
  subscribeWallet,
  toUserFacingError,
  type WalletAdapter,
  type WalletSnapshot,
} from "@/lib/stellar/wallet";

type WalletContextValue = WalletSnapshot & {
  wallets: WalletAdapter[];
  selectedWalletId: string | null;
  selectWallet: (id: string) => void;
  connect: () => Promise<void>;
  disconnect: () => void;
  error: string | null;
};
const initial: WalletSnapshot = { status: "disconnected", address: null, network: null, correctNetwork: false };
const WalletContext = createContext<WalletContextValue | null>(null);
export function WalletProvider({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(() => getWalletAdapters(), []);
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(() => wallets[0]?.id ?? null);
  const [wallet, setWallet] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  const selectWallet = useCallback((id: string) => {
    setSelectedWalletId(id);
    setError(null);
    setWallet(initial);
  }, []);

  useEffect(() => {
    if (!selectedWalletId) return;
    let active = true;
    const apply = (snapshot: WalletSnapshot) => { if (active) setWallet(snapshot); };
    readWallet(selectedWalletId)
      .then(apply)
      .catch((err) => { if (active) setError(toUserFacingError(err)); });
    const unsubscribe = subscribeWallet(selectedWalletId, apply);
    return () => { active = false; unsubscribe(); };
  }, [selectedWalletId]);

  const connect = useCallback(async () => {
    if (!selectedWalletId) { setError("No compatible wallet is available. Please install a supported Stellar wallet."); return; }
    setError(null);
    setWallet({ ...initial, status: "connecting" });
    try {
      setWallet(await connectWallet(selectedWalletId));
    } catch (err) {
      setWallet(initial);
      setError(toUserFacingError(err));
    }
  }, [selectedWalletId]);

  const disconnect = useCallback(() => {
    if (selectedWalletId) disconnectWallet(selectedWalletId);
    setError(null);
    setWallet(initial);
  }, [selectedWalletId]);

  const value = useMemo(
    () => ({ ...wallet, wallets, selectedWalletId, selectWallet, connect, disconnect, error }),
    [wallet, wallets, selectedWalletId, selectWallet, connect, disconnect, error],
  );
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
export function useWallet() { const value = useContext(WalletContext); if (!value) throw new Error("useWallet must be used inside WalletProvider"); return value; }
