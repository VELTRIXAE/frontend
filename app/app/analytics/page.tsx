import { AnalyticsView } from "@/components/app/analytics-view";

export default function AnalyticsPage() {
  return (
    <>
      <div className="page-title">
        <h1>Analytics</h1>
        <p>
          Indexed trading, liquidity, transaction, and token metrics. Each chart
          shows its aggregation window and data freshness, and missing or
          partially indexed data is called out explicitly rather than shown as
          zero.
        </p>
      </div>
      <section aria-labelledby="analytics-workspace-heading">
        <h2 id="analytics-workspace-heading" className="sr-only">
          Analytics workspace
        </h2>
        <AnalyticsView />
      </section>
    </>
  );
}