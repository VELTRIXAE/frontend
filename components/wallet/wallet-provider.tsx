"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  getWalletAdapters,
  toUserFacingError,
  type WalletAdapter,
  type WalletSnapshot,
} from "@/lib/stellar/wallet";

type WalletContextValue = WalletSnapshot & {
  adapters: WalletAdapter[];
  walletName: string | null;
  connect: (id?: string) => Promise<void>;
  disconnect: () => Promise<void>;
  signTransaction: (xdr: string) => Promise<string>;
  onAccountChange?: (listener: (address: string | null) => void) => () => void;
  onNetworkChange?: (listener: (network: string | null) => void) => () => void;
  error?: string;
};

const initial: WalletSnapshot = {
  status: "disconnected",
  connected: false,
  address: null,
  network: null,
  correctNetwork: false,
};

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const sourceAdapters = useMemo(() => getWalletAdapters(), []);
  const [availability, setAvailability] = useState<Record<string, boolean>>({});
  const [activeAdapter, setActiveAdapter] = useState<WalletAdapter | null>(null);
  const [wallet, setWallet] = useState<WalletSnapshot>(initial);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    void Promise.all(
      sourceAdapters.map(async (adapter) => [adapter.id, await adapter.isAvailable()] as const),
    ).then((entries) => {
      if (active) setAvailability(Object.fromEntries(entries));
    });
    return () => {
      active = false;
    };
  }, [sourceAdapters]);

  const adapters = useMemo(
    () => sourceAdapters.map((adapter) => ({ ...adapter, isAvailable: () => availability[adapter.id] ?? false })),
    [availability, sourceAdapters],
  );

  const connect = useCallback(async (id?: string) => {
    const adapter = sourceAdapters.find((candidate) => candidate.id === id) ?? sourceAdapters[0];
    if (!adapter || !(await adapter.isAvailable())) {
      setError("This wallet is not available in your browser.");
      return;
    }
    setError(undefined);
    setWallet({ ...initial, status: "connecting" });
    try {
      const snapshot = await adapter.connect();
      setActiveAdapter(adapter);
      setWallet({
        ...snapshot,
        status: "connected",
        connected: true,
        correctNetwork: snapshot.network === "TESTNET" || snapshot.correctNetwork === true,
      });
    } catch (reason) {
      setWallet(initial);
      setError(toUserFacingError(reason));
    }
  }, [sourceAdapters]);

  useEffect(() => {
    if (!activeAdapter) return;
    const unsubscribeAccount = activeAdapter.onAccountChange?.((address) => {
      setWallet((current) => ({ ...current, address, connected: Boolean(address), status: address ? "connected" : "disconnected" }));
    });
    const unsubscribeNetwork = activeAdapter.onNetworkChange?.((network) => {
      setWallet((current) => ({ ...current, network, correctNetwork: network === "TESTNET" }));
    });
    return () => {
      unsubscribeAccount?.();
      unsubscribeNetwork?.();
    };
  }, [activeAdapter]);

  const disconnect = useCallback(async () => {
    await activeAdapter?.disconnect?.();
    setActiveAdapter(null);
    setError(undefined);
    setWallet(initial);
  }, [activeAdapter]);

  const signTransaction = useCallback(async (xdr: string) => {
    if (!activeAdapter) throw new Error("Connect a wallet before signing.");
    return activeAdapter.signTransaction(xdr, { network: "TESTNET" });
  }, [activeAdapter]);

  const value = useMemo<WalletContextValue>(() => ({
    ...wallet,
    adapters,
    walletName: activeAdapter?.name ?? null,
    connect,
    disconnect,
    signTransaction,
    onAccountChange: activeAdapter?.onAccountChange,
    onNetworkChange: activeAdapter?.onNetworkChange,
    error,
  }), [activeAdapter, adapters, connect, disconnect, error, signTransaction, wallet]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const value = useContext(WalletContext);
  if (!value) throw new Error("useWallet must be used inside WalletProvider");
  return value;
}
