"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getNetworkHealth, getStellarAccount, type NetworkHealth, type StellarAccount } from "@/lib/stellar/horizon";
import { useWallet } from "./wallet-provider";

type AccountContextValue = { account?: StellarAccount; health?: NetworkHealth; loading: boolean; error?: string; refreshedAt?: Date; refresh: () => Promise<void> };
const AccountContext = createContext<AccountContextValue | null>(null);
export function AccountProvider({ children }: { children: React.ReactNode }) {
  const wallet = useWallet(); const [account,setAccount] = useState<StellarAccount>(); const [health,setHealth] = useState<NetworkHealth>(); const [loading,setLoading] = useState(false); const [error,setError] = useState<string>(); const [refreshedAt,setRefreshedAt] = useState<Date>();
  const refresh = useCallback(async()=>{setLoading(true);setError(undefined);try{const [nextHealth,nextAccount]=await Promise.all([getNetworkHealth(),wallet.address?getStellarAccount(wallet.address):Promise.resolve(undefined)]);setHealth(nextHealth);setAccount(nextAccount);setRefreshedAt(new Date());}catch(reason){setError(reason instanceof Error?reason.message:"Stellar account data is unavailable.");setAccount(undefined);}finally{setLoading(false)}},[wallet.address]);
  useEffect(()=>{const timer=window.setTimeout(()=>void refresh(),0);return()=>window.clearTimeout(timer)},[refresh]);
  useEffect(()=>{const onFocus=()=>{if(document.visibilityState==="visible")void refresh()};document.addEventListener("visibilitychange",onFocus);return()=>document.removeEventListener("visibilitychange",onFocus)},[refresh]);
  // React to adapter account/network change events so data refreshes without a page reload.
  useEffect(()=>{
    const unsubscribeAccount=wallet.onAccountChange?.(()=>{void refresh()});
    const unsubscribeNetwork=wallet.onNetworkChange?.(()=>{void refresh()});
    return ()=>{unsubscribeAccount?.();unsubscribeNetwork?.()};
  },[wallet.onAccountChange,wallet.onNetworkChange,refresh]);
  // Surface provider-specific wallet errors as accessible messages.
  useEffect(()=>{
    if(wallet.error){setError(wallet.error);setAccount(undefined);setLoading(false);}
  },[wallet.error]);
  const value=useMemo(()=>({account,health,loading,error,refreshedAt,refresh}),[account,health,loading,error,refreshedAt,refresh]);
  return (
    <AccountContext.Provider value={value}>
      {error ? (
        <p role="alert" aria-live="assertive" className="sr-only">
          {error}
        </p>
      ) : null}
      {children}
    </AccountContext.Provider>
  );
}
export function useAccount(){const value=useContext(AccountContext);if(!value)throw new Error("useAccount must be used inside AccountProvider");return value}
