# Backend integration

Configure the backend origin with `NEXT_PUBLIC_VELTRIXAE_API_URL`. The client calls the documented `/api/v1` endpoints for tokens, pools, markets, quotes, swap preparation, transaction status, network status, and overview analytics.

Amounts are integer base-unit strings; timestamps are Unix milliseconds. Token labels are contract metadata and are displayed as metadata, not issuer endorsements. Missing prices and history remain unavailable.

Requests time out after 12 seconds. Obsolete quote requests are aborted. Safe reads can retry transient server/network failures once; POST requests are not retried. Backend `{error:{code,message}}` envelopes are preserved in `ApiError`.

The API never receives signed transaction envelopes. After Freighter signs, the frontend submits directly to the configured Stellar RPC. The current backend documentation states quotes are `executable: false` until verified deployments exist, so signing remains disabled in that state.

## Published contract

The versioned backend contract is published as machine-readable OpenAPI documentation at `/api/v1/openapi.json` (served from the backend origin). It is the single source of truth for every endpoint used by `lib/api/client.ts`:

- **Assets** — `GET /api/v1/tokens`, `GET /api/v1/tokens/{id}`
- **Pools** — `GET /api/v1/pools`, `GET /api/v1/pools/{id}`
- **Markets** — `GET /api/v1/markets`
- **Portfolio** — `GET /api/v1/portfolio`
- **Analytics** — `GET /api/v1/analytics/overview`
- **Quote** — `POST /api/v1/quote`
- **Build** — `POST /api/v1/swap/prepare`
- **Submit** — `GET /api/v1/transactions/{hash}`
- **Network** — `GET /api/v1/network/status`

Every endpoint listed above is documented in the OpenAPI contract and available on Testnet. Contract fixtures under `contracts/fixtures/` validate against the frontend Zod schemas; invalid responses fail the contract tests.

## Authentication

Public read endpoints (assets, pools, markets, portfolio, analytics, network status, transaction status) require no credentials. Write endpoints (`POST /api/v1/quote`, `POST /api/v1/swap/prepare`) accept an optional bearer token via `Authorization: Bearer <token>`; when the backend enforces authentication, unauthenticated requests receive `401` with the standard error envelope.

## Pagination

List endpoints (`tokens`, `pools`, `markets`) accept `limit` (default `20`, max `100`) and `cursor` query parameters and return a `nextCursor` field (`null` when exhausted). Cursors are opaque strings; clients must not parse them.

## Error envelopes

All non-2xx responses use the envelope `{ "error": { "code": string, "message": string, "requestId": string } }`. The frontend preserves this envelope in `ApiError`. `code` is a stable machine-readable identifier; `message` is human-readable and may change.

## Rate limits

The backend enforces per-client rate limits and returns `429` with `Retry-After` (seconds) and the standard error envelope when exceeded. Clients should honor `Retry-After` and avoid retrying write requests.

## Request identifiers

Clients may send an `X-Request-Id` header; the backend echoes it (or generates one) in the `X-Request-Id` response header and in the error envelope's `requestId` field for correlation.

## No fabricated data

No frontend fallback fabricates missing financial data. When the backend omits prices, history, or other financial fields, the frontend surfaces them as unavailable rather than substituting synthetic values.