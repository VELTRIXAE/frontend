# Backend integration

Configure the backend origin with `NEXT_PUBLIC_VELTRIXAE_API_URL`. The client calls the documented `/api/v1` endpoints for tokens, pools, markets, quotes, swap preparation, transaction status, network status, and overview analytics.

Amounts are integer base-unit strings; timestamps are Unix milliseconds. Token labels are contract metadata and are displayed as metadata, not issuer endorsements. Missing prices and history remain unavailable.

Requests time out after 12 seconds. Obsolete quote requests are aborted. Safe reads can retry transient server/network failures once; POST requests are not retried. Backend `{error:{code,message}}` envelopes are preserved in `ApiError`.

The API never receives signed transaction envelopes. After Freighter signs, the frontend submits directly to the configured Stellar RPC. The current backend documentation states quotes are `executable: false` until verified deployments exist, so signing remains disabled in that state.

## Request-ID correlation

Every backend response must include an `X-Request-Id` header (and echo the same value in the `{error:{code,message,requestId}}` envelope on failures). The frontend captures this identifier and attaches it to client-side error reports so a frontend error can be traced to the originating backend request. Backend services must propagate the inbound `X-Request-Id` through internal calls and logs; if a request arrives without one, the backend generates a fresh identifier and returns it. Telemetry must never include wallet addresses, signed XDR, or other sensitive account data — only the request identifier and non-sensitive context.

## Asset explorer API

The asset explorer consumes versioned asset and pair endpoints. Responses are versioned via an explicit `schemaVersion` field; clients reject unknown major versions rather than guessing.

- `GET /api/v1/assets?q=<query>&limit=&cursor=` — search by asset code, issuer account, or contract ID. Duplicate codes are returned as distinct records keyed by `(code, issuer)` or contract ID; the client must never merge records that share a code but differ by issuer or contract.
- `GET /api/v1/assets/{assetKey}` — asset detail including issuer details, verification provenance, and supported trading pairs.
- `GET /api/v1/assets/{assetKey}/pairs` — trading pairs and available pools with liquidity where indexed.

Each asset record includes a `verification` object: `{ status: "verified" | "unverified" | "unknown", provenanceUrl, verifiedAt }`. Verification badges link to `provenanceUrl`; when provenance is absent the badge renders an explicit unknown state rather than implying verification. Historical charts are rendered only when the response includes a supported history series; otherwise the UI shows an unavailable state. Search and detail routes must remain keyboard and screen-reader accessible (labelled inputs, focus management, and announced result counts).

## Analytics API

Analytics responses are versioned (`schemaVersion`) and pass the existing analytics schemas or their versioned replacements. Each metric series declares its aggregation window (`window`: e.g. `1h`, `24h`, `7d`), the metric formula identifier, and freshness metadata:

- `sourceLedger` — the latest ledger included in the aggregation.
- `indexedAt` — Unix milliseconds when the indexer produced the response.
- `coverage` — `{ complete: boolean, gaps: [{ from, to }] }` describing any ledger ranges not yet indexed.

Volume, liquidity, transaction count, and token performance series follow the same envelope. Partial indexing and gaps are surfaced explicitly: the UI displays the time range and freshness for every chart, and missing data is rendered as an unavailable state — never as zero. When `coverage.complete` is false, charts annotate the gap rather than interpolating across it. Metric formulas are documented alongside their identifiers and covered by fixture-based tests so calculations remain stable across changes.