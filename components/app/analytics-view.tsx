"use client";
import { Activity, BarChart3, Blocks, Database } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import type { AnalyticsSeries, AnalyticsWindow, Overview } from "@/lib/api/schemas";
import { Card } from "@/components/ui/card";
import { ResourceState } from "./resource-state";

const WINDOWS: { id: AnalyticsWindow; label: string }[] = [
  { id: "24h", label: "24 hours" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
];

type SeriesKind = "volume" | "liquidity" | "transactions" | "tokens";

const SERIES: { kind: SeriesKind; title: string; unit: string }[] = [
  { kind: "volume", title: "Trading volume", unit: "quote units" },
  { kind: "liquidity", title: "Liquidity", unit: "quote units" },
  { kind: "transactions", title: "Transaction count", unit: "txs" },
  { kind: "tokens", title: "Token performance", unit: "% change" },
];

function formatValue(value: number | null, unit: string): string {
  if (value === null) return "Unavailable";
  if (unit === "% change") return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}`;
}

function SeriesPanel({ series, kind, title, unit }: { series: AnalyticsSeries; kind: SeriesKind; title: string; unit: string }) {
  const points = series.points;
  const gaps = series.gaps ?? [];
  const partial = series.partial || gaps.length > 0;
  const hasData = points.some((point) => point.value !== null);
  return (
    <Card className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        <span>
          {series.window} · {new Date(series.from).toLocaleString()} – {new Date(series.to).toLocaleString()}
        </span>
      </div>
      <div className="panel-meta">
        <small>Source ledger {series.sourceLedger.toLocaleString()}</small>
        <small>Indexed {new Date(series.indexedAt).toLocaleString()}</small>
        {partial && <small className="badge-warning">Partial indexing</small>}
      </div>
      {!hasData ? (
        <ResourceState
          icon={BarChart3}
          title="No indexed data"
          description={`No ${title.toLowerCase()} observations are indexed for this window. Values are not shown as zero.`}
        />
      ) : (
        <ul className="series-list" data-series={kind}>
          {points.map((point) => (
            <li key={point.timestamp} className={point.value === null ? "series-gap" : undefined}>
              <span>{new Date(point.timestamp).toLocaleString()}</span>
              <strong>{formatValue(point.value, unit)}</strong>
            </li>
          ))}
        </ul>
      )}
      {gaps.length > 0 && (
        <small className="series-gaps">
          Gaps: {gaps.map((gap) => `${new Date(gap.from).toLocaleString()} – ${new Date(gap.to).toLocaleString()}`).join(", ")}
        </small>
      )}
    </Card>
  );
}

export function AnalyticsView() {
  const [data, setData] = useState<Overview>();
  const [analytics, setAnalytics] = useState<AnalyticsSeries[]>();
  const [window, setWindow] = useState<AnalyticsWindow>("7d");
  const [error, setError] = useState("");
  const [analyticsError, setAnalyticsError] = useState("");
  const [unsupported, setUnsupported] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api.overview(controller.signal).then(setData).catch((reason) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Analytics unavailable.");
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setAnalytics(undefined);
    setAnalyticsError("");
    setUnsupported(false);
    api
      .analytics(window, controller.signal)
      .then(setAnalytics)
      .catch((reason) => {
        if (controller.signal.aborted) return;
        if (reason instanceof Error && /unsupported|not implemented|404/i.test(reason.message)) {
          setUnsupported(true);
        } else {
          setAnalyticsError(reason instanceof Error ? reason.message : "Analytics unavailable.");
        }
      });
    return () => controller.abort();
  }, [window]);

  if (error) return <ResourceState icon={BarChart3} title="Analytics unavailable" description="" error={error} />;
  if (!data) return <ResourceState icon={BarChart3} title="Loading analytics…" description="Requesting the backend overview." />;

  return (
    <>
      <div className="metric-grid">
        <Card className="metric-card">
          <div><span>Factory pools</span><Activity /></div>
          <strong>{data.poolCount}</strong>
          <small>Ledger {data.ledger.toLocaleString()}</small>
        </Card>
        <Card className="metric-card">
          <div><span>Tokens</span><Blocks /></div>
          <strong>{data.tokenCount}</strong>
          <small>On-chain metadata</small>
        </Card>
        <Card className="metric-card">
          <div><span>Protocols</span><Database /></div>
          <strong>{data.protocols.length}</strong>
          <small>{data.protocols.join(", ") || "None configured"}</small>
        </Card>
        <Card className="metric-card">
          <div><span>TVL</span><BarChart3 /></div>
          <strong>Unavailable</strong>
          <small>No verified USD pricing</small>
        </Card>
      </div>
      <Card className="panel">
        <div className="panel-head">
          <h2>Indexed protocol analytics</h2>
          <span>Observed {new Date(data.observedAt).toLocaleString()}</span>
        </div>
        <div className="window-selector" role="group" aria-label="Aggregation window">
          {WINDOWS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={window === option.id}
              onClick={() => setWindow(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Card>
      {unsupported ? (
        <Card className="panel">
          <ResourceState
            icon={BarChart3}
            title="Indexed analytics are not available"
            description="The backend does not expose indexed series yet. Charts remain hidden instead of displaying synthetic data."
          />
        </Card>
      ) : analyticsError ? (
        <Card className="panel">
          <ResourceState icon={BarChart3} title="Analytics unavailable" description="" error={analyticsError} />
        </Card>
      ) : !analytics ? (
        <Card className="panel">
          <ResourceState icon={BarChart3} title="Loading analytics…" description={`Requesting indexed series for the ${window} window.`} />
        </Card>
      ) : (
        SERIES.map(({ kind, title, unit }) => {
          const series = analytics.find((entry) => entry.metric === kind);
          if (!series) {
            return (
              <Card className="panel" key={kind}>
                <div className="panel-head"><h2>{title}</h2><span>{window}</span></div>
                <ResourceState
                  icon={BarChart3}
                  title="Metric unavailable"
                  description={`The backend does not provide ${title.toLowerCase()} for this window. No zero values are substituted.`}
                />
              </Card>
            );
          }
          return <SeriesPanel key={kind} series={series} kind={kind} title={title} unit={unit} />;
        })
      )}
    </>
  );
}
