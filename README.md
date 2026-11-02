# VELTRIXAE Frontend
VELTRIXAE is a non-custodial Stellar trading interface. This repository targets **Stellar Testnet only**; Mainnet is intentionally unavailable.

![VELTRIXAE desktop dashboard and swap mockup](docs/mockups/veltrixae-desktop.png)

## Current status

| Feature | Status |
| --- | --- |
| Freighter connect, network detection, address, and signing | Implemented; mocked tests pass, live wallet not verified in this audit |
| Horizon balances, recent transactions, and network health | Implemented with validated live Testnet reads |
| Backend tokens, pools, markets, quotes, preparation, and status | Integrated against the published `/api/v1` contract |
| Swap execution | Guarded implementation; unavailable while backend quotes are non-executable |
| Pool and market discovery | Read-only, backed by verified factory snapshots |
| Add/remove liquidity | Unavailable; no supported preparation API |
| Portfolio quantities | Available from Horizon |
| USD prices, LP positions, history, volume, and TVL | Unavailable without verified providers/indexers |

The inspected backend documents no completed VELTRIXAE Testnet deployment and currently returns `executable: false` quotes. This frontend does not claim a successful live swap and does not substitute mock financial data.

## Development

Requires Node.js 22+ and pnpm 12.16.1.

```bash
cp .env.example .env.local
pnpm install --frozen-lockfile
pnpm dev
```

Open <http://localhost:3000>.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Recommended | Canonical frontend URL |
| `NEXT_PUBLIC_VELTRIXAE_API_URL` | For backend data | Backend origin; the client adds `/api/v1` |
| `NEXT_PUBLIC_STELLAR_RPC_URL` | Optional | Defaults to Stellar Testnet RPC |
| `NEXT_PUBLIC_STELLAR_HORIZON_URL` | Optional | Defaults to Testnet Horizon |

Never provide private keys or recovery phrases. All wallet authorization stays in Freighter. Signed envelopes are submitted directly to Stellar RPC, never to the VELTRIXAE backend.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test:coverage
pnpm build
```

Wallet and backend tests are mocked unless explicitly documented as live. See [testing](docs/TESTING.md) and the [frontend audit](docs/FRONTEND_AUDIT.md).

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Frontend setup](docs/FRONTEND_SETUP.md)
- [Wallet integration](docs/WALLET_INTEGRATION.md)
- [Backend integration](docs/BACKEND_INTEGRATION.md)
- [Testing](docs/TESTING.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)

## Deployment

For Vercel, import the repository, use Node.js 22 and pnpm, set the public environment variables, and deploy. Do not enable Mainnet or claim executable trading until backend readiness, contract identifiers, wallet review, RPC submission, and finality have been verified end to end.

Licensed under the [MIT License](LICENSE).
