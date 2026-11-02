"use client";
import { Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Token } from "@/lib/api/schemas";

export function TokenSelector({ assets, selected, onSelect, label }: { assets: Token[]; selected?: Token; onSelect:(asset:Token)=>void; label:string }) {
  const [open,setOpen]=useState(false); const [query,setQuery]=useState("");
  useEffect(()=>{if(!open)return;const close=(event:KeyboardEvent)=>{if(event.key==="Escape")setOpen(false)};document.addEventListener("keydown",close);return()=>document.removeEventListener("keydown",close)},[open]);
  const visible=useMemo(()=>assets.filter(a=>`${a.symbol} ${a.name} ${a.asset?.code??""}`.toLowerCase().includes(query.toLowerCase())),[assets,query]);
  return <><button className="token-select" type="button" aria-haspopup="dialog" onClick={()=>setOpen(true)}>{selected?<><span className="token-symbol" aria-hidden="true">{selected.symbol[0]}</span>{selected.symbol}<small>⌄</small></>:"Select asset"}</button>{open&&<div className="modal-backdrop" role="presentation" onMouseDown={()=>setOpen(false)}><div className="token-modal" role="dialog" aria-modal="true" aria-label={label} onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><b>{label}</b><button type="button" onClick={()=>setOpen(false)} aria-label="Close token selector"><X/></button></div><label className="search-field"><Search aria-hidden="true"/><span className="sr-only">Search tokens</span><input autoFocus placeholder="Search name or symbol" value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="token-list">{visible.map(asset=><button type="button" key={asset.contract} onClick={()=>{onSelect(asset);setOpen(false);setQuery("")}}><span className="token-symbol" aria-hidden="true">{asset.symbol[0]}</span><span><b>{asset.symbol}</b><small>{asset.name}</small></span><em title="Metadata read from the token contract">On-chain metadata</em></button>)}{!visible.length&&<p>No matching assets.</p>}</div></div></div>}</>;
}
