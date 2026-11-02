# Backend integration

Configure the backend origin with `NEXT_PUBLIC_VELTRIXAE_API_URL`. The client calls the documented `/api/v1` endpoints for tokens, pools, markets, quotes, swap preparation, transaction status, network status, and overview analytics.

Amounts are integer base-unit strings; timestamps are Unix milliseconds. Token labels are contract metadata and are displayed as metadata, not issuer endorsements. Missing prices and history remain unavailable.

Requests time out after 12 seconds. Obsolete quote requests are aborted. Safe reads can retry transient server/network failures once; POST requests are not retried. Backend `{error:{code,message}}` envelopes are preserved in `ApiError`.

The API never receives signed transaction envelopes. After Freighter signs, the frontend submits directly to the configured Stellar RPC. The current backend documentation states quotes are `executable: false` until verified deployments exist, so signing remains disabled in that state.
