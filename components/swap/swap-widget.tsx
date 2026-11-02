"use client";

import { ArrowDown, CheckCircle2, ChevronDown, ExternalLink, Info, LoaderCircle, RefreshCw, Route, Settings2, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import type { ContractRegistry, Quote, QuoteRequest, Token } from "@/lib/api/schemas";
import { fromBaseUnits, quoteRate, toBaseUnits } from "@/lib/amounts";
import { config } from "@/lib/config";
import { simulateTransactionXdr, submitSignedTransactionXdr } from "@/lib/stellar/simulation";
import { assetCode } from "@/lib/stellar/horizon";
import { useAccount } from "@/components/wallet/account-provider";
import { useWallet } from "@/components/wallet/wallet-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TokenSelector } from "./token-selector";

type Status="idle"|"quoting"|"preparing"|"simulating"|"signing"|"submitting"|"confirming"|"success"|"error";
const isPending=(status:Status)=>["preparing","simulating","signing","submitting","confirming"].includes(status);
const explorerTx=(hash:string)=>`https://stellar.expert/explorer/testnet/tx/${hash}`;
const shortId=(id:string)=>id.length>12?`${id.slice(0,6)}…${id.slice(-4)}`:id;

export function SwapWidget(){
  const wallet=useWallet(); const {account}=useAccount(); const requestSequence=useRef(0);
  const [assets,setAssets]=useState<Token[]>([]); const [sell,setSell]=useState<Token>(); const [buy,setBuy]=useState<Token>();
  const [amount,setAmount]=useState(""); const [slippage,setSlippage]=useState(50); const [settings,setSettings]=useState(false);
  const [quote,setQuote]=useState<Quote>(); const [status,setStatus]=useState<Status>("idle"); const [message,setMessage]=useState(""); const [hash,setHash]=useState(""); const [assetError,setAssetError]=useState(config.apiUrl?"":"The aggregator API is not configured."); const [now,setNow]=useState(()=>Date.now());
  const [registry,setRegistry]=useState<ContractRegistry>(); const [registryError,setRegistryError]=useState(""); const [preparedFee,setPreparedFee]=useState<string>(""); const [preparedContracts,setPreparedContracts]=useState<{swap?:string;router?:string;factory?:string}>();

  useEffect(()=>{const controller=new AbortController();if(!config.apiUrl)return()=>controller.abort();api.tokens(controller.signal).then(({tokens})=>{setAssets(tokens);setSell(tokens[0]);setBuy(tokens[1])}).catch(error=>{if(!controller.signal.aborted)setAssetError(error instanceof Error?error.message:"Token registry unavailable.")});return()=>controller.abort()},[]);

  useEffect(()=>{const controller=new AbortController();if(!config.apiUrl)return()=>controller.abort();api.contractRegistry(controller.signal).then(setRegistry).catch(error=>{if(!controller.signal.aborted)setRegistryError(error instanceof Error?error.message:"Contract registry unavailable.")});return()=>controller.abort()},[]);

  const request=useMemo<QuoteRequest|undefined>(()=>{if(!sell||!buy||!amount)return;try{const units=toBaseUnits(amount,sell.decimals);if(BigInt(units)<=0n)return;return{tokenIn:sell.contract,tokenOut:buy.contract,amount:units,kind:"exactIn",slippageBps:slippage,maxHops:3}}catch{return}},[amount,buy,sell,slippage]);

  useEffect(()=>{if(!request)return;const sequence=++requestSequence.current;const controller=new AbortController();let expiryTimer=0;const timer=window.setTimeout(async()=>{setQuote(undefined);setHash("");setPreparedFee("");setPreparedContracts(undefined);setStatus("quoting");setMessage("");try{const result=await api.quote(request,controller.signal);if(sequence===requestSequence.current){setQuote(result);setNow(Date.now());setStatus("idle");expiryTimer=window.setTimeout(()=>setNow(Date.now()),Math.max(0,result.expiresAt-Date.now()+50))}}catch(error){if(!controller.signal.aborted&&sequence===requestSequence.current){setStatus("error");setMessage(error instanceof Error?error.message:"Quote failed.")}}},500);return()=>{window.clearTimeout(timer);window.clearTimeout(expiryTimer);controller.abort()}},[request]);

  const balance=useMemo(()=>{if(!sell||!account)return"—";const found=account.balances.find(item=>assetCode(item)===sell.asset?.code&&(!sell.asset?.issuer||item.asset_issuer===sell.asset.issuer));return found?found.balance:"0"},[account,sell]);
  const expired=Boolean(quote&&quote.expiresAt<=now);
  const executable=Boolean(quote?.executable&&!expired);
  const registryReady=Boolean(registry&&registry.verified&&registry.networkPassphrase===config.networkPassphrase);
  const registryBlocked=Boolean(registryError)||Boolean(registry&&!registryReady);
  const registryReason=registryError?registryError:registry&&!registry.verified?"Contract registry contains unverified deployments.":registry&&registry.networkPassphrase!==config.networkPassphrase?"Contract registry targets a different network.":"";
  const action=useMemo(()=>{if(wallet.status!=="connected")return"Connect wallet";if(!wallet.correctNetwork)return"Switch wallet to Testnet";if(registryBlocked)return"Contracts unverified — writes disabled";if(assetError)return"Aggregator unavailable";if(!sell||!buy)return"No supported pair";if(status==="quoting")return"Requesting live quote…";if(!quote)return"Enter an amount";if(expired)return"Quote expired — re-quote to continue";if(!quote.executable)return"Execution unavailable";return"Prepare swap"},[assetError,buy,expired,quote,registryBlocked,sell,status,wallet.correctNetwork,wallet.status]);

  const execute=async()=>{if(wallet.status!=="connected"){await wallet.connect();return}if(!wallet.correctNetwork||registryBlocked||!quote||!wallet.address||!request||!executable||isPending(status))return;
    try{
      setStatus("preparing");setMessage("Refreshing the quote and preparing an unsigned transaction…");
      const prepared=await api.prepareSwap(request,wallet.address);
      if(!prepared.quote.executable||prepared.quote.expiresAt<=Date.now())throw new Error("The prepared quote is not executable. Request a fresh quote.");
      setPreparedFee(prepared.totalFee);setPreparedContracts(prepared.contracts);
      setStatus("simulating");setMessage(`Independently simulating on Stellar Testnet. Estimated total fee: ${fromBaseUnits(prepared.totalFee,7,7)} XLM.`);
      await simulateTransactionXdr(prepared.transactionXdr);
      setStatus("signing");setMessage("Review the contract, limits, fee, and expiry in your wallet before approving.");
      const signed=await wallet.signTransaction(prepared.transactionXdr);
      setStatus("submitting");setMessage("Submitting the signed envelope directly to Stellar RPC…");
      const transactionHash=await submitSignedTransactionXdr(signed);setHash(transactionHash);setStatus("confirming");setMessage("Transaction accepted by RPC. Waiting for final status…");
      for(let attempt=0;attempt<30;attempt++){const result=await api.transaction(transactionHash);if(result.status==="SUCCESS"){setStatus("success");setMessage("Swap finalized successfully.");return}if(result.status==="FAILED")throw new Error(result.failure||"The transaction failed on Stellar.");await new Promise(resolve=>setTimeout(resolve,2000))}
      setStatus("success");setMessage("Transaction submitted, but final status is still unknown. Check the explorer before retrying.");
    }catch(error){setStatus("error");setMessage(error instanceof ApiError||error instanceof Error?error.message:"Swap failed.")}
  };

  const clearQuote=()=>{setQuote(undefined);setHash("");setMessage("");setPreparedFee("");setPreparedContracts(undefined);setStatus("idle")};
  const requote=()=>{if(!request)return;clearQuote();setNow(Date.now());setStatus("quoting");api.quote(request).then(result=>{setQuote(result);setNow(Date.now());setStatus("idle")}).catch(error=>{setStatus("error");setMessage(error instanceof Error?error.message:"Quote failed.")})};
  const pending=isPending(status); const output=quote&&buy?fromBaseUnits(quote.amountOut,buy.decimals):"";
  const swapContract=preparedContracts?.swap??registry?.swap;
  const routerContract=preparedContracts?.router??registry?.router;
  const factoryContract=preparedContracts?.factory??registry?.factory;
  return <div className="swap-layout"><Card className="swap-card"><div className="swap-card-head"><div><h2>Swap</h2><span>Verified backend data · Stellar Testnet</span></div><button type="button" aria-label="Swap settings" aria-expanded={settings} onClick={()=>setSettings(!settings)}><Settings2/></button></div>
    {settings&&<div className="swap-settings"><label>Slippage tolerance<div><button type="button" className={slippage===10?"active":""} onClick={()=>{clearQuote();setSlippage(10)}}>0.1%</button><button type="button" className={slippage===50?"active":""} onClick={()=>{clearQuote();setSlippage(50)}}>0.5%</button><button type="button" className={slippage===100?"active":""} onClick={()=>{clearQuote();setSlippage(100)}}>1.0%</button></div></label><div className="settings-note"><b>Quote lifetime</b><span>Set by the backend from current ledger state.</span></div></div>}
    <div className="swap-input"><div><span>You pay</span><small>Balance {balance}{sell?` ${sell.symbol}`:""}</small></div><div><input aria-label="Sell amount" inputMode="decimal" placeholder="0.00" value={amount} onChange={event=>{const next=event.target.value;if(/^\d*(?:\.\d*)?$/.test(next)){clearQuote();setAmount(next)}}}/><TokenSelector assets={assets.filter(asset=>asset.contract!==buy?.contract)} selected={sell} onSelect={token=>{clearQuote();setSell(token)}} label="Select asset to sell"/></div></div>
    <button type="button" className="direction-button" aria-label="Reverse swap assets" onClick={()=>{if(sell&&buy){setSell(buy);setBuy(sell);setAmount("")}}}><ArrowDown/></button>
    <div className="swap-input"><div><span>You receive</span><small>Estimated output</small></div><div><input aria-label="Estimated buy amount" placeholder={status==="quoting"?"Quoting…":"0.00"} readOnly value={output}/><TokenSelector assets={assets.filter(asset=>asset.contract!==sell?.contract)} selected={buy} onSelect={token=>{clearQuote();setBuy(token)}} label="Select asset to receive"/></div></div>
    {quote&&sell&&buy&&<div className="quote-summary"><div><span>Rate</span><b>1 {sell.symbol} = {quoteRate(quote.amountIn,sell.decimals,quote.amountOut,buy.decimals)} {buy.symbol}</b></div><div><span>Price impact</span><b className={quote.selectedRoute.priceImpactBps>500?"impact-high":""}>{(quote.selectedRoute.priceImpactBps/100).toFixed(2)}%</b></div><div><span>Minimum received</span><b>{fromBaseUnits(quote.minimumReceived,buy.decimals)} {buy.symbol}</b></div><div><span>Slippage tolerance</span><b>{(slippage/100).toFixed(2)}%</b></div><div><span>Network fee</span><b>{preparedFee?`${fromBaseUnits(preparedFee,7,7)} XLM`:"Available after preparation"}</b></div><div><span>Quote expires</span><b>{new Date(quote.expiresAt).toLocaleTimeString()}</b></div></div>}
    {expired&&<div className="quote-expired" role="alert"><XCircle/><span>This quote has expired. Re-quote to continue.</span><Button type="button" onClick={requote} disabled={pending}><RefreshCw/>Re-quote</Button></div>}
    <Button className="execute-swap" disabled={pending||wallet.status==="connected"&&(!wallet.correctNetwork||registryBlocked||!executable)} onClick={execute}>{pending&&<LoaderCircle className="spin"/>}{action}</Button>
    {(registryBlocked||assetError||message)&&<div className={`tx-message ${registryBlocked||assetError?"error":status}`} role={registryBlocked||assetError||status==="error"?"alert":"status"}>{status==="success"?<CheckCircle2/>:registryBlocked||assetError||status==="error"?<XCircle/>:<LoaderCircle className="spin"/>}<span>{registryBlocked?`Write actions disabled: ${registryReason}`:assetError||message}{hash&&<a href={explorerTx(hash)} target="_blank" rel="noreferrer">View on Stellar Expert <ExternalLink/></a>}</span></div>}
  </Card><aside className="swap-side"><Card className="route-card"><div className="panel-head"><h2>Route preview</h2><Route/></div>{quote&&sell&&buy?<><div className="route-path"><span>{sell.symbol}</span>{quote.selectedRoute.pools.map((pool,index)=><div key={pool}><ChevronDown/><small>{quote.selectedRoute.protocol} · {shortId(pool)}</small><b>{index===quote.selectedRoute.pools.length-1?buy.symbol:"Hop"}</b></div>)}</div><p>Observed at ledger {quote.ledger.toLocaleString()}. Metadata labels are sourced on-chain but are not issuer endorsements.</p></>:<div className="empty-state"><Route/><b>No live route yet</b><p>Select two API-supported tokens and enter an amount to request a current route.</p></div>}</Card>
    <Card className="contract-card"><div className="panel-head"><h2>Contract registry</h2>{registryReady?<ShieldCheck/>:<ShieldAlert/>}</div>{registry?<div className="contract-meta"><div><span>Status</span><b className={registryReady?"verified":"unverified"}>{registry.verified?"Verified":"Unverified"}</b></div><div><span>Network</span><b>{registry.networkPassphrase===config.networkPassphrase?"Stellar Testnet":"Wrong network"}</b></div><div><span>Deployment ledger</span><b>{registry.deploymentLedger.toLocaleString()}</b></div><div><span>Source commit</span><b>{shortId(registry.sourceCommit)}</b></div><div><span>Swap</span><b title={swapContract}>{swapContract?shortId(swapContract):"—"}</b></div><div><span>Router</span><b title={routerContract}>{routerContract?shortId(routerContract):"—"}</b></div><div><span>Factory</span><b title={factoryContract}>{factoryContract?shortId(factoryContract):"—"}</b></div></div>:<p className="contract-meta-empty">{registryError||"Loading verified contract metadata…"}</p>}</Card>
    <Card className="trade-note"><Info/><div><b>{registryBlocked?"Writes disabled":quote?.executable?"Simulation required":"Read-only quotes"}</b><p>{registryBlocked?registryReason:quote?.executable?"VELTRIXAE independently simulates prepared transactions before asking your wallet to sign.":"The backend currently marks this route non-executable. No wallet signature can be requested."}</p></div></Card></aside></div>;
}
