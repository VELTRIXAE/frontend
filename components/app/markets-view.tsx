"use client";
import { Search, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import type { Market, Token } from "@/lib/api/schemas";
import { Card } from "@/components/ui/card";
import { ResourceState } from "./resource-state";

type Verification = { label: string; provenanceUrl: string };

function verificationFor(token: Token | undefined): Verification | null {
  if (!token) return null;
  const record = token as Token & { verified?: boolean; verificationUrl?: string; provenance?: string };
  if (!record.verified) return null;
  const url = record.verificationUrl ?? record.provenance;
  if (!url) return null;
  return { label: "Verified", provenanceUrl: url };
}

function shortContract(contract: string) {
  return contract.length > 12 ? `${contract.slice(0, 6)}…${contract.slice(-4)}` : contract;
}

export function MarketsView() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedPool, setSelectedPool] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([api.markets(controller.signal), api.tokens(controller.signal)])
      .then(([result, registry]) => { setMarkets(result.markets); setTokens(registry.tokens); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Markets unavailable."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const tokenByContract = useMemo(() => {
    const map = new Map<string, Token>();
    tokens.forEach(token => map.set(token.contract, token));
    return map;
  }, [tokens]);

  const tokenLabel = (contract: string) => {
    const token = tokenByContract.get(contract);
    if (!token) return "Unknown asset";
    return `${token.symbol} · ${shortContract(token.contract)}`;
  };

  const matchesQuery = (token: Token | undefined, contract: string) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    if (contract.toLowerCase().includes(needle)) return true;
    if (!token) return false;
    const issuer = (token as Token & { issuer?: string }).issuer;
    return token.symbol.toLowerCase().includes(needle) || (issuer ? issuer.toLowerCase().includes(needle) : false);
  };

  const visible = markets.filter(market => matchesQuery(tokenByContract.get(market.token0), market.token0) || matchesQuery(tokenByContract.get(market.token1), market.token1));
  const selected = selectedPool ? markets.find(market => market.pool === selectedPool) ?? null : null;

  const openDetail = (pool: string) => {
    setSelectedPool(pool);
    requestAnimationFrame(() => detailRef.current?.focus());
  };

  const renderVerification = (contract: string) => {
    const verification = verificationFor(tokenByContract.get(contract));
    if (!verification) return <span className="badge badge-muted" aria-label="Verification status: unverified">Unverified</span>;
    return <a className="badge badge-verified" href={verification.provenanceUrl} target="_blank" rel="noopener noreferrer" aria-label={`${verification.label} asset, view provenance`}><ShieldCheck aria-hidden="true" size={14}/> {verification.label}</a>;
  };

  return <>
    <div className="toolbar">
      <label className="search-field">
        <Search aria-hidden="true"/>
        <span className="sr-only">Search assets by code, issuer, or contract ID</span>
        <input
          type="search"
          placeholder="Search by code, issuer, or contract ID"
          value={query}
          onChange={event => setQuery(event.target.value)}
          aria-describedby="markets-search-hint"
        />
      </label>
      <p id="markets-search-hint" className="sr-only">Results update as you type. Duplicate asset codes are distinguished by issuer or contract ID.</p>
    </div>
    <Card className="data-card">
      <h2 className="sr-only">Verified trading pairs</h2>
      <div className="data-head" role="row"><span role="columnheader">Pair</span><span role="columnheader">Issuers</span><span role="columnheader">Verification</span><span role="columnheader">Raw spot ratio</span><span role="columnheader">Fee</span><span role="columnheader">Protocol</span><span role="columnheader">Details</span></div>
      {loading ? <ResourceState icon={ShieldCheck} title="Loading markets…" description="Reading verified pool ratios from the API."/> : error ? <ResourceState icon={ShieldCheck} title="Markets unavailable" description="" error={error}/> : visible.length ? visible.map(market => {
        const token0 = tokenByContract.get(market.token0);
        const token1 = tokenByContract.get(market.token1);
        const issuer0 = (token0 as Token & { issuer?: string } | undefined)?.issuer;
        const issuer1 = (token1 as Token & { issuer?: string } | undefined)?.issuer;
        return <div className="data-row" role="row" key={market.pool}>
          <b role="cell">{tokenLabel(market.token0)} / {tokenLabel(market.token1)}</b>
          <span role="cell">{issuer0 ? shortContract(issuer0) : "—"} / {issuer1 ? shortContract(issuer1) : "—"}</span>
          <span role="cell">{renderVerification(market.token0)} {renderVerification(market.token1)}</span>
          <span role="cell">{market.spotRatio.numerator} / {market.spotRatio.denominator} {market.ratioUnits}</span>
          <span role="cell">{market.feeBps / 100}%</span>
          <span role="cell">{market.protocol}</span>
          <span role="cell"><button type="button" className="link-button" aria-expanded={selectedPool === market.pool} aria-controls="market-detail" onClick={() => openDetail(market.pool)}>View details</button></span>
        </div>;
      }) : <ResourceState icon={ShieldCheck} title="No markets found" description="The verified factory returned no matching markets."/>}
    </Card>
    {selected && <div id="market-detail" ref={detailRef} tabIndex={-1} aria-live="polite">
      <Card className="data-card">
        <h2>{tokenLabel(selected.token0)} / {tokenLabel(selected.token1)}</h2>
        <dl className="detail-list">
          <dt>Pool</dt><dd>{selected.pool}</dd>
          <dt>Protocol</dt><dd>{selected.protocol}</dd>
          <dt>Fee</dt><dd>{selected.feeBps / 100}%</dd>
          <dt>Liquidity</dt><dd>{(selected as Market & { liquidity?: string }).liquidity ?? "Unavailable"}</dd>
          <dt>Issuer (base)</dt><dd>{(tokenByContract.get(selected.token0) as Token & { issuer?: string } | undefined)?.issuer ?? "Unavailable"}</dd>
          <dt>Issuer (quote)</dt><dd>{(tokenByContract.get(selected.token1) as Token & { issuer?: string } | undefined)?.issuer ?? "Unavailable"}</dd>
        </dl>
        <section aria-labelledby="market-history-heading">
          <h3 id="market-history-heading">Historical metrics</h3>
          <p className="unavailable-state" role="status">Historical charts are unavailable for this pool because no supported historical data was returned.</p>
        </section>
      </Card>
    </div>}
  </>;
}
