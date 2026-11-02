"use client";
import { Search, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import type { Market, Token } from "@/lib/api/schemas";
import { Card } from "@/components/ui/card";
import { ResourceState } from "./resource-state";

export function MarketsView() {
  const [markets, setMarkets] = useState<Market[]>([]); const [tokens, setTokens] = useState<Token[]>([]); const [query, setQuery] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  useEffect(() => { const controller = new AbortController(); Promise.all([api.markets(controller.signal), api.tokens(controller.signal)]).then(([result, registry]) => { setMarkets(result.markets); setTokens(registry.tokens); }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Markets unavailable."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, []);
  const symbol = (contract: string) => tokens.find(token => token.contract === contract)?.symbol ?? "Unknown";
  const visible = markets.filter(market => `${symbol(market.token0)} ${symbol(market.token1)}`.toLowerCase().includes(query.toLowerCase()));
  return <><div className="toolbar"><label className="search-field"><Search/><span className="sr-only">Search market assets</span><input placeholder="Search token symbols" value={query} onChange={event => setQuery(event.target.value)}/></label></div><Card className="data-card"><div className="data-head"><span>Market</span><span>Raw spot ratio</span><span>Fee</span><span>Protocol</span></div>{loading ? <ResourceState icon={ShieldCheck} title="Loading markets…" description="Reading verified pool ratios from the API."/> : error ? <ResourceState icon={ShieldCheck} title="Markets unavailable" description="" error={error}/> : visible.length ? visible.map(market => <div className="data-row" key={market.pool}><b>{symbol(market.token0)} / {symbol(market.token1)}</b><span>{market.spotRatio.numerator} / {market.spotRatio.denominator} {market.ratioUnits}</span><span>{market.feeBps / 100}%</span><span>{market.protocol}</span></div>) : <ResourceState icon={ShieldCheck} title="No markets found" description="The verified factory returned no matching markets."/>}</Card></>;
}
