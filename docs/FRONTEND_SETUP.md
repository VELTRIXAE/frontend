# Frontend setup

Requirements: Node.js 22+, pnpm 12.16.1, and optional Freighter for wallet testing.

```bash
cp .env.example .env.local
pnpm install --frozen-lockfile
pnpm dev
```

Set `NEXT_PUBLIC_VELTRIXAE_API_URL` to the backend origin, not `/api/v1`; the client adds that path. RPC and Horizon default to Stellar Testnet. `NEXT_PUBLIC_APP_URL` sets canonical metadata.

Do not place secrets in `NEXT_PUBLIC_*` variables. The frontend needs no private key, recovery phrase, backend credential, or wallet secret.
