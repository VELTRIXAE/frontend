"use client";
import { useEffect, useMemo, useState } from "react";
import { ChartPie, Coins, Droplets, ListRestart } from "lucide-react";
import { useWallet } from "@/components/wallet/wallet-provider";
import { useAccount } from "@/components/wallet/account-provider";
import { assetCode } from "@/lib/stellar/horizon";
import { Card } from "@/components/ui/card";
import { ResourceState } from "./resource-state";
import {
  PRICE_SOURCE_NAME,
  assetIdentity,
  fetchPortfolioPrices,
  fetchPortfolioHistory,
  type PortfolioPrice,
  type PortfolioHistoryPoint,
} from "@/lib/pricing/portfolio-pricing";

type PriceState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; prices: PortfolioPrice[]; fetchedAt: string }
  | { status: "error"; error: string };

type HistoryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; points: PortfolioHistoryPoint[]; fetchedAt: string }
  | { status: "error"; error: string };

function formatFreshness(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "freshness unknown";
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return `updated ${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `updated ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `updated ${hours}h ago`;
}

function formatUsd(value: number): string {
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

export function PortfolioView() {
  const wallet = useWallet();
  const { account, loading, error } = useAccount();
  const [priceState, setPriceState] = useState<PriceState>({ status: "idle" });
  const [historyState, setHistoryState] = useState<HistoryState>({ status: "idle" });

  const balances = useMemo(() => account?.balances ?? [], [account?.balances]);
  const identities = useMemo(
    () => balances.map((balance) => assetIdentity(balance)),
    [balances],
  );
  const identityKey = identities.map((id) => id.key).join("|");

  useEffect(() => {
    if (!wallet.address || identities.length === 0) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setPriceState({ status: "loading" });
      void fetchPortfolioPrices(identities)
      .then((result) => {
        if (cancelled) return;
        setPriceState({ status: "ready", prices: result.prices, fetchedAt: result.fetchedAt });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPriceState({
          status: "error",
          error: err instanceof Error ? err.message : "Price request failed",
        });
      });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // identityKey captures the set of assets being priced.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.address, identityKey]);

  useEffect(() => {
    if (!wallet.address || identities.length === 0) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setHistoryState({ status: "loading" });
      void fetchPortfolioHistory(identities)
      .then((result) => {
        if (cancelled) return;
        setHistoryState({ status: "ready", points: result.points, fetchedAt: result.fetchedAt });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setHistoryState({
          status: "error",
          error: err instanceof Error ? err.message : "History request failed",
        });
      });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.address, identityKey]);

  const priceByKey = useMemo(() => {
    const map = new Map<string, PortfolioPrice>();
    if (priceState.status === "ready") {
      for (const price of priceState.prices) map.set(price.key, price);
    }
    return map;
  }, [priceState]);

  const rows = useMemo(
    () =>
      balances.map((balance) => {
        const identity = assetIdentity(balance);
        const price = priceByKey.get(identity.key);
        const quantity = Number(balance.balance);
        const priced = price && price.available && Number.isFinite(quantity);
        const value = priced ? quantity * price.usd : null;
        return { balance, identity, price, quantity, priced, value };
      }),
    [balances, priceByKey],
  );

  const pricedRows = rows.filter((row) => row.priced && row.value !== null);
  const unpricedRows = rows.filter((row) => !row.priced);
  const totalValue = pricedRows.reduce((sum, row) => sum + (row.value ?? 0), 0);
  const hasPrices = priceState.status === "ready";
  const hasPricedAssets = pricedRows.length > 0;

  if (!wallet.address)
    return (
      <ResourceState
        icon={ChartPie}
        title="Connect a wallet"
        description="Connect Freighter to retrieve balances directly from Stellar Testnet Horizon."
      />
    );
  if (error)
    return <ResourceState icon={ChartPie} title="Portfolio unavailable" description="" error={error} />;
  if (loading && !account)
    return (
      <ResourceState
        icon={ChartPie}
        title="Loading portfolio…"
        description="Retrieving verified account balances and transaction history."
      />
    );

  const priceSourceLabel = `Source: ${PRICE_SOURCE_NAME}`;

  return (
    <>
      <div className="metric-grid">
        <Card className="metric-card">
          <div>
            <span>Portfolio value</span>
            <ChartPie />
          </div>
          {hasPrices && hasPricedAssets ? (
            <>
              <strong>{formatUsd(totalValue)}</strong>
              <small>
                {priceSourceLabel} · {formatFreshness(priceState.fetchedAt)}
              </small>
            </>
          ) : priceState.status === "loading" ? (
            <>
              <strong>Loading…</strong>
              <small>{priceSourceLabel}</small>
            </>
          ) : priceState.status === "error" ? (
            <>
              <strong>Unavailable</strong>
              <small>Price request failed · {priceSourceLabel}</small>
            </>
          ) : (
            <>
              <strong>Unavailable</strong>
              <small>No priced assets · {priceSourceLabel}</small>
            </>
          )}
        </Card>
        <Card className="metric-card">
          <div>
            <span>Holdings</span>
            <Coins />
          </div>
          <strong>{balances.length}</strong>
          <small>
            Live Horizon balances
            {unpricedRows.length > 0 ? ` · ${unpricedRows.length} unpriced` : ""}
          </small>
        </Card>
        <Card className="metric-card">
          <div>
            <span>Positions</span>
            <Droplets />
          </div>
          <strong>Unavailable</strong>
          <small>No position indexer</small>
        </Card>
        <Card className="metric-card">
          <div>
            <span>Recent transactions</span>
            <ListRestart />
          </div>
          <strong>{account?.transactions.length ?? 0}</strong>
          <small>Latest Horizon records</small>
        </Card>
      </div>
      <div className="dashboard-grid">
        <Card className="panel">
          <div className="panel-head">
            <h2>Token holdings</h2>
            <span>{priceSourceLabel}</span>
          </div>
          {balances.length ? (
            <div className="simple-list">
              {rows.map(({ balance, identity, price, priced, value }) => (
                <div key={identity.key}>
                  <b>{assetCode(balance)}</b>
                  <span>{balance.balance}</span>
                  {priced && value !== null ? (
                    <span>
                      {formatUsd(value)} · {formatFreshness(price!.asOf)}
                    </span>
                  ) : (
                    <span>Price unavailable — excluded from total</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <ResourceState
              icon={Coins}
              title="No holdings returned"
              description="This Testnet account has no asset balances."
            />
          )}
        </Card>
        <Card className="panel">
          <div className="panel-head">
            <h2>Asset distribution</h2>
            <span>{priceSourceLabel}</span>
          </div>
          {hasPrices && hasPricedAssets ? (
            <div className="simple-list">
              {pricedRows.map(({ identity, value }) => {
                const share = totalValue > 0 ? ((value ?? 0) / totalValue) * 100 : 0;
                return (
                  <div key={identity.key}>
                    <b>{identity.label}</b>
                    <span>{formatUsd(value ?? 0)}</span>
                    <span>{share.toFixed(1)}%</span>
                  </div>
                );
              })}
              {unpricedRows.length > 0 ? (
                <div>
                  <b>Unpriced assets</b>
                  <span>{unpricedRows.length}</span>
                  <span>Excluded from distribution</span>
                </div>
              ) : null}
            </div>
          ) : (
            <ResourceState
              icon={ChartPie}
              title="Valuation unavailable"
              description={`No verified prices from ${PRICE_SOURCE_NAME}. Distribution is not calculated without source data.`}
            />
          )}
        </Card>
        <Card className="panel">
          <div className="panel-head">
            <h2>Valuation history</h2>
            <span>{priceSourceLabel}</span>
          </div>
          {historyState.status === "ready" && historyState.points.length > 0 ? (
            <>
              <div className="simple-list">
                {historyState.points.map((point) => (
                  <div key={point.timestamp}>
                    <b>{new Date(point.timestamp).toLocaleString()}</b>
                    {point.value === null ? (
                      <span>No source data</span>
                    ) : (
                      <span>{formatUsd(point.value)}</span>
                    )}
                    <span>{point.value === null ? "missing interval" : "priced"}</span>
                  </div>
                ))}
              </div>
              <small>
                {priceSourceLabel} · {formatFreshness(historyState.fetchedAt)}
              </small>
            </>
          ) : historyState.status === "loading" ? (
            <ResourceState
              icon={ChartPie}
              title="Loading history…"
              description={`Retrieving historical points from ${PRICE_SOURCE_NAME}.`}
            />
          ) : historyState.status === "error" ? (
            <ResourceState
              icon={ChartPie}
              title="History unavailable"
              description={`Historical data could not be retrieved from ${PRICE_SOURCE_NAME}.`}
            />
          ) : (
            <ResourceState
              icon={ChartPie}
              title="No historical data"
              description={`${PRICE_SOURCE_NAME} returned no historical points for these assets. Missing intervals are not shown as zero.`}
            />
          )}
        </Card>
      </div>
    </>
  );
}
