"use client";
import { Droplets, Search, Waves } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import type { Pool, Token } from "@/lib/api/schemas";
import { fromBaseUnits } from "@/lib/amounts";
import { Card } from "@/components/ui/card";
import { ResourceState } from "./resource-state";

export function PoolsView() {
  const [pools, setPools] = useState<Pool[]>([]); const [tokens, setTokens] = useState<Token[]>([]); const [observedAt, setObservedAt] = useState<number>();
  const [query, setQuery] = useState(""); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  useEffect(() => { const controller = new AbortController(); Promise.all([api.pools(controller.signal), api.tokens(controller.signal)]).then(([snapshot, registry]) => { setPools(snapshot.pools); setObservedAt(snapshot.observedAt); setTokens(registry.tokens); }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Pools unavailable."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, []);
  const token = (contract: string) => tokens.find(item => item.contract === contract);
  const visible = pools.filter(pool => { const a = token(pool.token0); const b = token(pool.token1); return `${a?.symbol ?? pool.token0} ${b?.symbol ?? pool.token1}`.toLowerCase().includes(query.toLowerCase()); });
  return <><div className="toolbar"><label className="search-field"><Search/><span className="sr-only">Search pools</span><input placeholder="Search pools or token symbols" value={query} onChange={event => setQuery(event.target.value)}/></label>{observedAt && <span className="freshness">Observed {new Date(observedAt).toLocaleString()}</span>}</div><Card className="data-card"><div className="data-head"><span>Pool</span><span>On-chain reserves</span><span>Fee</span><span>Ledger</span></div>{loading ? <ResourceState icon={Waves} title="Loading verified pools…" description="Requesting pool data from the configured API."/> : error ? <ResourceState icon={Waves} title="Pools unavailable" description="" error={error}/> : visible.length ? visible.map(pool => { const a = token(pool.token0); const b = token(pool.token1); return <div className="data-row" key={pool.id} title={pool.id}><b>{a?.symbol ?? "Unknown"} / {b?.symbol ?? "Unknown"}</b><span>{a ? fromBaseUnits(pool.reserve0, a.decimals, 4) : pool.reserve0} / {b ? fromBaseUnits(pool.reserve1, b.decimals, 4) : pool.reserve1}</span><span>{pool.feeBps / 100}%</span><span>{pool.ledger.toLocaleString()}</span></div>; }) : <ResourceState icon={Droplets} title="No pools found" description="No factory-verified pools matched your search."/>}</Card></>;
}
