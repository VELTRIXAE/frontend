"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getNetworkHealth, getStellarAccount, type NetworkHealth, type StellarAccount } from "@/lib/stellar/horizon";
import { useWallet } from "./wallet-provider";

type AccountContextValue = { account?: StellarAccount; health?: NetworkHealth; loading: boolean; error?: string; refreshedAt?: Date; refresh: () => Promise<void> };
const AccountContext = createContext<AccountContextValue | null>(null);
export function AccountProvider({ children }: { children: React.ReactNode }) {
  const wallet = useWallet(); const [account,setAccount] = useState<StellarAccount>(); const [health,setHealth] = useState<NetworkHealth>(); const [loading,setLoading] = useState(false); const [error,setError] = useState<string>(); const [refreshedAt,setRefreshedAt] = useState<Date>();
  const { address, onAccountChange, onNetworkChange, error: walletError } = wallet;
  const refresh = useCallback(async()=>{setLoading(true);setError(undefined);try{const [nextHealth,nextAccount]=await Promise.all([getNetworkHealth(),address?getStellarAccount(address):Promise.resolve(undefined)]);setHealth(nextHealth);setAccount(nextAccount);setRefreshedAt(new Date());}catch(reason){setError(reason instanceof Error?reason.message:"Stellar account data is unavailable.");setAccount(undefined);}finally{setLoading(false)}},[address]);
  useEffect(()=>{const timer=window.setTimeout(()=>void refresh(),0);return()=>window.clearTimeout(timer)},[refresh]);
  useEffect(()=>{const onFocus=()=>{if(document.visibilityState==="visible")void refresh()};document.addEventListener("visibilitychange",onFocus);return()=>document.removeEventListener("visibilitychange",onFocus)},[refresh]);
  // React to adapter account/network change events so data refreshes without a page reload.
  useEffect(()=>{
    const unsubscribeAccount=onAccountChange?.(()=>{void refresh()});
    const unsubscribeNetwork=onNetworkChange?.(()=>{void refresh()});
    return ()=>{unsubscribeAccount?.();unsubscribeNetwork?.()};
  },[onAccountChange,onNetworkChange,refresh]);
  const displayedError = walletError ?? error;
  const value=useMemo(()=>({account,health,loading,error:displayedError,refreshedAt,refresh}),[account,health,loading,displayedError,refreshedAt,refresh]);
  return (
    <AccountContext.Provider value={value}>
      {displayedError ? (
        <p role="alert" aria-live="assertive" className="sr-only">
          {displayedError}
        </p>
      ) : null}
      {children}
    </AccountContext.Provider>
  );
}
export function useAccount(){const value=useContext(AccountContext);if(!value)throw new Error("useAccount must be used inside AccountProvider");return value}
