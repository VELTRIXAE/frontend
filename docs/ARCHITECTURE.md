# Architecture

VELTRIXAE is a Next.js App Router frontend. Server-rendered route shells provide metadata and layout; interactive trading, wallet, and account features are client components.

The data boundaries are intentional:

- `lib/api`: the VELTRIXAE backend contract. Every response is runtime-validated. The backend supplies token metadata, pools, routes, preparation, status, and current protocol counts.
- `lib/stellar/horizon.ts`: public Testnet account balances, recent transactions, and network health.
- `lib/stellar/wallet.ts`: Freighter permission, address/network reads, and signing.
- `lib/stellar/simulation.ts`: independent RPC simulation and direct submission of a wallet-signed envelope.
- `lib/amounts.ts`: decimal/base-unit conversion using strings and `BigInt`.

`WalletProvider` owns the provider session; `AccountProvider` shares Horizon state and refresh behavior. Feature pages retain local UI/request state. This avoids a broad store while the application has only two cross-route domains.

The transaction trust boundary is: quote → backend preparation with a fresh quote → frontend RPC simulation → user review/signing in Freighter → direct Stellar RPC submission → backend status polling. Private keys never enter the application or API.
