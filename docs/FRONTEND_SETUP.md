# Frontend setup

Requirements: Node.js 22+, pnpm 12.16.1, and optional Freighter for wallet testing.

```bash
cp .env.example .env.local
pnpm install --frozen-lockfile
pnpm dev
```

Set `NEXT_PUBLIC_VELTRIXAE_API_URL` to the backend origin, not `/api/v1`; the client adds that path. RPC and Horizon default to Stellar Testnet. `NEXT_PUBLIC_APP_URL` sets canonical metadata.

Do not place secrets in `NEXT_PUBLIC_*` variables. The frontend needs no private key, recovery phrase, backend credential, or wallet secret.

## Mainnet readiness gate

Mainnet is **disabled by default**. The build fails closed: unless every gate below is satisfied, the app builds and runs against Stellar Testnet only. Enabling Mainnet requires an explicit, deliberate release flag — it is never inferred from the presence of contract IDs or other configuration.

### Environment variables

| Variable | Required for Mainnet | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_STELLAR_NETWORK` | Yes | Must be `mainnet`. Any other value (including unset) keeps Testnet. |
| `NEXT_PUBLIC_MAINNET_ENABLED` | Yes | Explicit release flag. Must be the literal string `true`. |
| `NEXT_PUBLIC_MAINNET_RELEASE_TAG` | Yes | Release identifier (e.g. `v1.4.0`) recorded in telemetry and the readiness report. |
| `NEXT_PUBLIC_CONTRACT_ID_*` | Yes | Verified contract IDs for every contract the app calls. |
| `NEXT_PUBLIC_VELTRIXAE_API_URL` | Yes | Backend origin for the Mainnet deployment. |
| `NEXT_PUBLIC_APP_URL` | Yes | Canonical Mainnet URL. |

### Verified contract requirements

Before the gate opens, every contract the frontend invokes must be:

- Deployed and initialized on Mainnet.
- Verified against the audited source (matching wasm hash / build artifact).
- Recorded with its contract ID in the release checklist.

If any required contract ID is missing, malformed, or unverified, the gate stays closed and the build refuses to target Mainnet.

### Explicit release flag

`NEXT_PUBLIC_MAINNET_ENABLED=true` is the only switch that can enable Mainnet, and it must be paired with `NEXT_PUBLIC_STELLAR_NETWORK=mainnet` and a `NEXT_PUBLIC_MAINNET_RELEASE_TAG`. Setting the flag without verified contracts, or setting contracts without the flag, leaves Mainnet disabled. This keeps the default safe and makes enabling Mainnet an auditable, intentional act.

### Safe default

With no Mainnet variables set, the app targets Stellar Testnet, the readiness gate reports "disabled", and no Mainnet contract calls are possible. See `docs/OPERATIONS.md` for the release, rollback, incident, and environment-validation checklists that accompany the gate.